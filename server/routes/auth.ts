import { fromError } from "zod-validation-error";
import { bootstrapUserSchema, createUserSchema, loginSchema, patchUserSchema } from "@shared/schema";
import { destroySession, establishSession, hashPassword, normalizeUsername, sanitizeUser, verifyPassword } from "../auth";
import type { RouteContext } from "./types";

function ensureLastActiveAdmin(users: Awaited<ReturnType<RouteContext["storage"]["getAllUsers"]>>, targetUserId: number, nextRole: string, nextIsActive: boolean) {
  const remainingActiveAdmins = users.filter((user) => user.id !== targetUserId && user.role === "admin" && user.isActive);
  if (remainingActiveAdmins.length === 0 && (nextRole !== "admin" || !nextIsActive)) {
    throw new Error("PTZ Command must keep at least one active admin.");
  }
}

export function registerAuthRoutes(ctx: RouteContext) {
  const { app, storage } = ctx;

  app.get("/api/auth/bootstrap-status", async (_req, res) => {
    const userCount = await storage.getUserCount();
    res.json({ needsSetup: userCount === 0 });
  });

  app.get("/api/auth/session", (req, res) => {
    if (!req.currentUser) {
      return res.status(401).json({ message: "Not signed in" });
    }

    return res.json({ user: req.currentUser });
  });

  app.post("/api/auth/bootstrap", async (req, res) => {
    const userCount = await storage.getUserCount();
    if (userCount > 0) {
      return res.status(409).json({ message: "Initial setup has already been completed." });
    }

    const parsed = bootstrapUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: fromError(parsed.error).toString() });
    }

    const user = await storage.createUser({
      username: normalizeUsername(parsed.data.username),
      displayName: parsed.data.displayName.trim(),
      passwordHash: await hashPassword(parsed.data.password),
      role: "admin",
      isActive: true,
    });

    const updatedUser = await storage.updateUser(user.id, { lastLoginAt: new Date() }) ?? user;
    await establishSession(req, updatedUser);

    return res.status(201).json({ user: sanitizeUser(updatedUser) });
  });

  app.post("/api/auth/login", async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: fromError(parsed.error).toString() });
    }

    const user = await storage.getUserByUsername(normalizeUsername(parsed.data.username));
    if (!user || !user.isActive || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
      return res.status(401).json({ message: "Invalid username or password" });
    }

    const updatedUser = await storage.updateUser(user.id, { lastLoginAt: new Date() }) ?? user;
    await establishSession(req, updatedUser);

    return res.json({ user: sanitizeUser(updatedUser) });
  });

  app.post("/api/auth/logout", async (req, res) => {
    await destroySession(req);
    res.clearCookie("connect.sid");
    res.json({ ok: true });
  });

  app.get("/api/users", async (_req, res) => {
    const users = await storage.getAllUsers();
    res.json(users.map(sanitizeUser));
  });

  app.post("/api/users", async (req, res) => {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: fromError(parsed.error).toString() });
    }

    const username = normalizeUsername(parsed.data.username);
    const existing = await storage.getUserByUsername(username);
    if (existing) {
      return res.status(409).json({ message: "That username is already in use." });
    }

    const created = await storage.createUser({
      username,
      displayName: parsed.data.displayName.trim(),
      passwordHash: await hashPassword(parsed.data.password),
      role: parsed.data.role,
      isActive: true,
    });

    res.status(201).json(sanitizeUser(created));
  });

  app.patch("/api/users/:id", async (req, res) => {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ message: "Invalid user id" });
    }

    const parsed = patchUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: fromError(parsed.error).toString() });
    }

    const existingUser = await storage.getUserById(userId);
    if (!existingUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const nextRole = parsed.data.role ?? existingUser.role;
    const nextIsActive = parsed.data.isActive ?? existingUser.isActive;
    if (existingUser.role === "admin" && existingUser.isActive) {
      try {
        ensureLastActiveAdmin(await storage.getAllUsers(), existingUser.id, nextRole, nextIsActive);
      } catch (error) {
        return res.status(400).json({ message: error instanceof Error ? error.message : "Unable to update user" });
      }
    }

    const updated = await storage.updateUser(userId, {
      displayName: parsed.data.displayName?.trim(),
      role: parsed.data.role,
      isActive: parsed.data.isActive,
      passwordHash: parsed.data.password ? await hashPassword(parsed.data.password) : undefined,
    });

    if (!updated) {
      return res.status(404).json({ message: "User not found" });
    }

    if (req.session.userId === updated.id && !updated.isActive) {
      await destroySession(req);
      res.clearCookie("connect.sid");
    }

    return res.json(sanitizeUser(updated));
  });
}
