import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import session from "express-session";
import { createServer, type Server } from "http";
import { csrfProtection } from "../server/csrf";

function setCookieHeaders(headers: Headers) {
  const maybeHeaders = headers as Headers & {
    getSetCookie?: () => string[];
    raw?: () => Record<string, string[]>;
  };

  if (maybeHeaders.getSetCookie) return maybeHeaders.getSetCookie();
  if (maybeHeaders.raw) return maybeHeaders.raw()["set-cookie"] || [];

  const combined = headers.get("set-cookie");
  return combined ? combined.split(/,(?=[^;,]+=)/) : [];
}

function cookieHeaderFromSetCookie(headers: string[]) {
  return headers.map((header) => header.split(";")[0]).join("; ");
}

function xsrfTokenFromSetCookie(headers: string[]) {
  const cookie = headers
    .map((header) => header.split(";")[0])
    .find((part) => part.startsWith("XSRF-TOKEN="));
  assert.ok(cookie, "expected XSRF-TOKEN cookie");
  return decodeURIComponent(cookie.slice("XSRF-TOKEN=".length));
}

async function withCsrfServer(callback: (baseUrl: string) => Promise<void>) {
  const app = express();
  app.use(express.json());
  app.use(session({ secret: "csrf-test-secret", resave: false, saveUninitialized: true }));
  app.use("/api", csrfProtection);
  app.get("/api/token", (_req, res) => res.json({ ok: true }));
  app.post("/api/action", (_req, res) => res.json({ ok: true }));

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const address = server.address();
    assert.equal(typeof address, "object");
    assert.ok(address);
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      (server as Server).close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test("CSRF middleware issues an XSRF cookie and requires it for unsafe API requests", async () => {
  await withCsrfServer(async (baseUrl) => {
    const tokenResponse = await fetch(`${baseUrl}/api/token`);
    assert.equal(tokenResponse.status, 200);

    const cookies = setCookieHeaders(tokenResponse.headers);
    const cookieHeader = cookieHeaderFromSetCookie(cookies);
    const token = xsrfTokenFromSetCookie(cookies);

    const missingResponse = await fetch(`${baseUrl}/api/action`, {
      method: "POST",
      headers: { Cookie: cookieHeader },
    });
    assert.equal(missingResponse.status, 403);
    assert.deepEqual(await missingResponse.json(), { message: "CSRF token missing" });

    const okResponse = await fetch(`${baseUrl}/api/action`, {
      method: "POST",
      headers: {
        Cookie: cookieHeader,
        "X-XSRF-TOKEN": token,
      },
    });
    assert.equal(okResponse.status, 200);
    assert.deepEqual(await okResponse.json(), { ok: true });
  });
});
