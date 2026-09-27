import type { Express, NextFunction, Request, Response } from "express";

const TRUST_PROXY_NAMES = new Set(["loopback", "linklocal", "uniquelocal"]);

export type TrustProxySetting = false | number | string[];

export function parseTrustProxySetting(value = process.env.PTZ_TRUST_PROXY): TrustProxySetting {
  const normalized = value?.trim();
  if (!normalized || normalized === "false" || normalized === "0") return false;
  if (normalized === "true") {
    throw new Error("PTZ_TRUST_PROXY=true is unsafe. Use loopback, a trusted CIDR, or a positive hop count.");
  }
  if (/^[1-9]\d*$/.test(normalized)) return Number(normalized);

  const entries = normalized.split(",").map((entry) => entry.trim()).filter(Boolean);
  if (!entries.length) return false;
  for (const entry of entries) {
    if (TRUST_PROXY_NAMES.has(entry)) continue;
    if (/^[0-9a-f:.]+(?:\/\d{1,3})?$/i.test(entry)) continue;
    throw new Error(`Invalid PTZ_TRUST_PROXY entry: ${entry}`);
  }
  return entries;
}

export function securityHeaders(nodeEnv = process.env.NODE_ENV || "development") {
  const scriptSrc = nodeEnv === "production" ? "'self'" : "'self' 'unsafe-eval'";
  const contentSecurityPolicy = [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "object-src 'none'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: http: https:",
    "media-src 'self' blob:",
    "connect-src 'self' http: https: ws: wss:",
    "worker-src 'self' blob:",
  ].join("; ");

  return (req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Content-Security-Policy", contentSecurityPolicy);
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Permissions-Policy", "camera=(self), microphone=(), geolocation=()");
    if (req.secure) {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    next();
  };
}

export function configureExpressSecurity(app: Express) {
  app.disable("x-powered-by");
  app.set("trust proxy", parseTrustProxySetting());
  app.use(securityHeaders());
}
