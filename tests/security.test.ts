import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import express from "express";
import rateLimit from "express-rate-limit";
import session from "express-session";
import { parseTrustProxySetting, securityHeaders } from "../server/security";
import { hasAllowedRequestOrigin } from "../server/auth";

async function withServer(
  configure: (app: express.Express) => void,
  run: (baseUrl: string) => Promise<void>,
) {
  const app = express();
  configure(app);
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("proxy trust rejects the unsafe trust-all setting", () => {
  assert.throws(() => parseTrustProxySetting("true"), /unsafe/);
  assert.deepEqual(parseTrustProxySetting("loopback, 10.0.0.0/8"), ["loopback", "10.0.0.0/8"]);
  assert.equal(parseTrustProxySetting("2"), 2);
});

test("browser origins must match the public Host header", () => {
  assert.equal(hasAllowedRequestOrigin({ host: "ptzcommand.local", origin: "https://ptzcommand.local" }, "https"), true);
  assert.equal(hasAllowedRequestOrigin({ host: "ptzcommand.local", origin: "http://ptzcommand.local" }, "https"), false);
  assert.equal(hasAllowedRequestOrigin({ host: "ptzcommand.local", origin: "https://attacker.example" }, "https"), false);
  assert.equal(hasAllowedRequestOrigin({ host: "ptzcommand.local" }), true);
});

test("trusted loopback proxy preserves per-client rate limits", async () => {
  await withServer((app) => {
    app.set("trust proxy", ["loopback"]);
    app.use(rateLimit({ windowMs: 60_000, limit: 1, legacyHeaders: false }));
    app.get("/", (req, res) => res.json({ ip: req.ip }));
  }, async (baseUrl) => {
    const first = await fetch(baseUrl, { headers: { "X-Forwarded-For": "192.0.2.10" } });
    const limited = await fetch(baseUrl, { headers: { "X-Forwarded-For": "192.0.2.10" } });
    const otherClient = await fetch(baseUrl, { headers: { "X-Forwarded-For": "192.0.2.11" } });
    assert.equal(first.status, 200);
    assert.equal(limited.status, 429);
    assert.equal(otherClient.status, 200);
  });
});

test("HTTPS proxy requests receive secure cookies and security headers", async () => {
  await withServer((app) => {
    app.set("trust proxy", ["loopback"]);
    app.use(securityHeaders("production"));
    app.use(session({
      secret: "test-session-secret-test-session-secret",
      resave: false,
      saveUninitialized: false,
      cookie: { secure: "auto", httpOnly: true, sameSite: "lax" },
    }));
    app.get("/", (req, res) => {
      req.session.userId = 1;
      res.send("ok");
    });
  }, async (baseUrl) => {
    const response = await fetch(baseUrl, { headers: { "X-Forwarded-Proto": "https" } });
    const cookie = response.headers.get("set-cookie") || "";
    assert.match(cookie, /; Secure/i);
    assert.equal(response.headers.get("x-frame-options"), "DENY");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.match(response.headers.get("content-security-policy") || "", /frame-ancestors 'none'/);
    assert.match(response.headers.get("strict-transport-security") || "", /max-age=31536000/);
  });
});
