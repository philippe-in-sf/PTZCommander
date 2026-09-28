import assert from "node:assert/strict";
import test from "node:test";
import { SmartThingsOAuthStore } from "../server/smartthings-oauth-store";

test("public OAuth session never includes secrets and is user-bound", () => {
  const store = new SmartThingsOAuthStore(60_000, () => 1_000);
  store.start("state-1", {
    clientId: "client-id",
    clientSecret: "client-secret",
    redirectUri: "https://example.test/callback",
    scope: "r:devices:*",
    userId: 7,
  });
  store.takePending("state-1");
  store.complete("state-1", {
    accessToken: "access-token",
    refreshToken: "refresh-token",
    expiresAt: "2026-01-01T00:00:00.000Z",
    scope: "r:devices:*",
    clientId: "client-id",
    clientSecret: "client-secret",
    userId: 7,
  });

  assert.equal(store.getPublicSession("state-1", 99), null);
  const pub = store.getPublicSession("state-1", 7);
  assert.ok(pub);
  assert.deepEqual(pub, {
    state: "state-1",
    ready: true,
    clientId: "client-id",
    expiresAt: "2026-01-01T00:00:00.000Z",
    scope: "r:devices:*",
    hasRefreshToken: true,
  });
  assert.equal("accessToken" in pub, false);
  assert.equal("clientSecret" in pub, false);
  assert.equal("refreshToken" in pub, false);
});

test("consume is one-time and TTL expires sessions", () => {
  let now = 1_000;
  const store = new SmartThingsOAuthStore(5_000, () => now);
  store.complete("state-2", {
    accessToken: "access-token",
    refreshToken: "refresh-token",
    expiresAt: "2026-01-01T00:00:00.000Z",
    clientId: "client-id",
    clientSecret: "client-secret",
    userId: 3,
  });

  assert.equal(store.getAccessToken("state-2", 3), "access-token");
  const first = store.consume("state-2", 3);
  assert.ok(first);
  assert.equal(first.clientSecret, "client-secret");
  assert.equal(store.consume("state-2", 3), null);
  assert.equal(store.getAccessToken("state-2", 3), null);

  store.complete("state-3", {
    accessToken: "later-token",
    expiresAt: "2026-01-01T00:00:00.000Z",
    clientId: "client-id",
    clientSecret: "client-secret",
    userId: 3,
  });
  now = 10_000;
  assert.equal(store.getPublicSession("state-3", 3), null);
  assert.equal(store.consume("state-3", 3), null);
});
