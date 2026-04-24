import { promisify } from "util";
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "crypto";
import type { IncomingMessage } from "http";
import type { NextFunction, Request, Response } from "express";
import session from "express-session";
import lusca from "lusca";
import connectPgSimple from "connect-pg-simple";
import createMemoryStore from "memorystore";
import type { User, UserRole } from "@shared/schema";
import { pool, useSqlite } from "./db";
import { storage } from "./storage";

const scrypt = promisify(scryptCallback);
const MemoryStore = createMemoryStore(session);
const PgStore = connectPgSimple(session);

export type SafeUser = Omit<User, "passwordHash">;

declare module "express-session" {
  interface SessionData {
    userId?: number;
  }
}

declare global {
  namespace Express {
    interface Request {
      currentUser: SafeUser | null;
    }
  }
}

const sessionSecret = process.env.SESSION_SECRET || "ptzcommand-dev-session-secret";
const sessionCookieSecure =
  process.env.SESSION_COOKIE_SECURE === "true"
    ? true
    : process.env.SESSION_COOKIE_SECURE === "false"
      ? false
      : "auto";

const sessionStore = !useSqlite && pool
  ? new PgStore({
      pool,
      tableName: "user_sessions",
      createTableIfMissing: true,
    })
  : new MemoryStore({
      checkPeriod: 24 * 60 * 60 * 1000,
    });

export const sessionMiddleware = session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: sessionCookieSecure,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
});

export const csrfMiddleware = lusca.csrf({
  key: "_csrf",
  impl: "session",
  header: "x-csrf-token",
  methods: ["POST", "PUT", "PATCH", "DELETE"],
});

const roleRank: Record<UserRole, number> = {
  viewer: 0,
  operator: 1,
  admin: 2,
};

type RouteRule = {
  methods: string[];
  pattern: RegExp;
  role: UserRole;
};

const PUBLIC_ROUTE_RULES: RouteRule[] = [
  { methods: ["GET"], pattern: /^\/api\/version$/, role: "viewer" },
  { methods: ["GET"], pattern: /^\/api\/auth\/bootstrap-status$/, role: "viewer" },
  { methods: ["POST"], pattern: /^\/api\/auth\/bootstrap$/, role: "viewer" },
  { methods: ["POST"], pattern: /^\/api\/auth\/login$/, role: "viewer" },
  { methods: ["POST"], pattern: /^\/api\/auth\/logout$/, role: "viewer" },
  { methods: ["GET"], pattern: /^\/api\/auth\/session$/, role: "viewer" },
  { methods: ["GET"], pattern: /^\/api\/displays\/smartthings\/oauth\/callback$/, role: "viewer" },
];

const EXPLICIT_ROUTE_RULES: RouteRule[] = [
  { methods: ["GET", "POST", "PATCH"], pattern: /^\/api\/users(?:\/\d+)?$/, role: "admin" },
  { methods: ["POST"], pattern: /^\/api\/rehearsal$/, role: "admin" },
  { methods: ["POST"], pattern: /^\/api\/cameras\/\d+\/webrtc\/offer$/, role: "viewer" },
  { methods: ["POST"], pattern: /^\/api\/cameras\/\d+\/program$/, role: "operator" },
  { methods: ["POST"], pattern: /^\/api\/cameras\/\d+\/preview$/, role: "operator" },
  { methods: ["PATCH", "POST", "DELETE"], pattern: /^\/api\/presets(?:\/\d+)?(?:\/recall)?$/, role: "operator" },
  { methods: ["POST"], pattern: /^\/api\/scene-buttons\/\d+\/test$/, role: "operator" },
  { methods: ["POST"], pattern: /^\/api\/scene-buttons\/\d+\/execute$/, role: "operator" },
  { methods: ["POST"], pattern: /^\/api\/layouts\/\d+\/load$/, role: "operator" },
  { methods: ["POST"], pattern: /^\/api\/macros\/\d+\/execute$/, role: "operator" },
  { methods: ["POST"], pattern: /^\/api\/undo$/, role: "operator" },
  { methods: ["POST"], pattern: /^\/api\/obs\/\d+\/program$/, role: "operator" },
  { methods: ["POST"], pattern: /^\/api\/switchers\/\d+\/cut$/, role: "operator" },
  { methods: ["POST"], pattern: /^\/api\/switchers\/\d+\/auto$/, role: "operator" },
  { methods: ["POST"], pattern: /^\/api\/switchers\/\d+\/program$/, role: "operator" },
  { methods: ["POST"], pattern: /^\/api\/switchers\/\d+\/preview$/, role: "operator" },
  { methods: ["PUT"], pattern: /^\/api\/hue\/bridges\/\d+\/lights\/[^/]+$/, role: "operator" },
  { methods: ["PUT"], pattern: /^\/api\/hue\/bridges\/\d+\/groups\/[^/]+$/, role: "operator" },
  { methods: ["POST"], pattern: /^\/api\/hue\/bridges\/\d+\/scenes\/[^/]+\/activate$/, role: "operator" },
  { methods: ["POST"], pattern: /^\/api\/displays\/\d+\/command$/, role: "operator" },
  { methods: ["POST"], pattern: /^\/api\/displays\/\d+\/refresh$/, role: "operator" },
  { methods: ["POST"], pattern: /^\/api\/displays\/\d+\/pair$/, role: "admin" },
  { methods: ["GET"], pattern: /^\/api\/displays\/smartthings\/oauth\/session\/[^/]+$/, role: "admin" },
  { methods: ["POST"], pattern: /^\/api\/displays\/smartthings\/oauth\/start$/, role: "admin" },
  { methods: ["POST"], pattern: /^\/api\/runsheet\/cues$/, role: "operator" },
  { methods: ["PATCH"], pattern: /^\/api\/runsheet\/cues\/\d+$/, role: "operator" },
  { methods: ["DELETE"], pattern: /^\/api\/runsheet\/cues\/\d+$/, role: "operator" },
  { methods: ["PUT"], pattern: /^\/api\/runsheet\/cues\/reorder$/, role: "operator" },
];

const OPERATOR_WS_COMMANDS = new Set([
  "pan_tilt",
  "pan_tilt_stop",
  "zoom",
  "focus_auto",
  "focus_far",
  "focus_near",
  "focus_stop",
  "recall_preset",
  "store_preset",
]);

export function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

export function sanitizeUser(user: User): SafeUser {
  const { passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser;
}

export function hasRequiredRole(role: UserRole, requiredRole: UserRole) {
  return roleRank[role] >= roleRank[requiredRole];
}

function matchesRule(path: string, method: string, rule: RouteRule) {
  return rule.methods.includes(method) && rule.pattern.test(path);
}

function isPublicApiRoute(path: string, method: string) {
  return PUBLIC_ROUTE_RULES.some((rule) => matchesRule(path, method, rule));
}

function getRequiredRoleForApi(path: string, method: string): UserRole {
  const explicitRule = EXPLICIT_ROUTE_RULES.find((rule) => matchesRule(path, method, rule));
  if (explicitRule) {
    return explicitRule.role;
  }

  if (method === "GET" || method === "HEAD") {
    return "viewer";
  }

  return "admin";
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  const [salt, key] = storedHash.split(":");
  if (!salt || !key) return false;
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
  const storedKey = Buffer.from(key, "hex");
  if (storedKey.length !== derivedKey.length) return false;
  return timingSafeEqual(storedKey, derivedKey);
}

function regenerateSession(req: Request) {
  return new Promise<void>((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function saveSession(req: Request) {
  return new Promise<void>((resolve, reject) => {
    req.session.save((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

export function destroySession(req: Request) {
  return new Promise<void>((resolve, reject) => {
    req.session.destroy((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

export async function establishSession(req: Request, user: User) {
  await regenerateSession(req);
  req.session.userId = user.id;
  req.currentUser = sanitizeUser(user);
  await saveSession(req);
}

async function loadUserFromSession(userId?: number) {
  if (!userId) return null;
  const user = await storage.getUserById(userId);
  if (!user || !user.isActive) {
    return null;
  }
  return user;
}

export async function attachCurrentUser(req: Request, _res: Response, next: NextFunction) {
  try {
    const user = await loadUserFromSession(req.session.userId);
    if (!user && req.session.userId) {
      req.session.userId = undefined;
    }
    req.currentUser = user ? sanitizeUser(user) : null;
    next();
  } catch (error) {
    next(error);
  }
}

export async function requireApiAccess(req: Request, res: Response, next: NextFunction) {
  try {
    const path = req.path;
    const method = req.method.toUpperCase();

    if (!path.startsWith("/api")) {
      return next();
    }

    if (isPublicApiRoute(path, method)) {
      return next();
    }

    if (!req.currentUser) {
      const userCount = await storage.getUserCount();
      if (userCount === 0) {
        return res.status(503).json({ message: "Initial admin setup is required before PTZ Command can be used." });
      }
      return res.status(401).json({ message: "Authentication required" });
    }

    const requiredRole = getRequiredRoleForApi(path, method);
    if (!hasRequiredRole(req.currentUser.role, requiredRole)) {
      return res.status(403).json({ message: `This action requires ${requiredRole} access.` });
    }

    return next();
  } catch (error) {
    return next(error);
  }
}

function runSessionMiddleware(request: IncomingMessage) {
  return new Promise<void>((resolve, reject) => {
    sessionMiddleware(request as Request, {} as Response, (error?: unknown) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

export async function resolveWsUser(request: IncomingMessage) {
  await runSessionMiddleware(request);
  const sessionUserId = (request as Request).session?.userId;
  const user = await loadUserFromSession(sessionUserId);
  return user ? sanitizeUser(user) : null;
}

export function wsCommandRequiresOperator(commandType: string) {
  return (
    OPERATOR_WS_COMMANDS.has(commandType) ||
    commandType.startsWith("mixer_") ||
    commandType.startsWith("atem_") ||
    commandType.startsWith("obs_")
  );
}
