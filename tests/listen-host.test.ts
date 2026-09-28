import assert from "node:assert/strict";
import test from "node:test";
import { resolveListenHost } from "../server/listen-host";

test("resolveListenHost defaults to loopback", () => {
  assert.equal(resolveListenHost({}), "127.0.0.1");
  assert.equal(resolveListenHost({ NODE_ENV: "production" }), "127.0.0.1");
});

test("resolveListenHost honors explicit host overrides", () => {
  assert.equal(resolveListenHost({ PTZ_HOST: "0.0.0.0" }), "0.0.0.0");
  assert.equal(resolveListenHost({ HOST: "10.0.0.5" }), "10.0.0.5");
  assert.equal(resolveListenHost({ PTZ_HOST: " 192.168.1.10 ", HOST: "0.0.0.0" }), "192.168.1.10");
});

test("resolveListenHost supports PTZ_BIND_ALL and Replit defaults", () => {
  assert.equal(resolveListenHost({ PTZ_BIND_ALL: "true" }), "0.0.0.0");
  assert.equal(resolveListenHost({ PTZ_BIND_ALL: "1" }), "0.0.0.0");
  assert.equal(resolveListenHost({ REPL_ID: "abc123" }), "0.0.0.0");
  assert.equal(resolveListenHost({ PTZ_BIND_ALL: "true", PTZ_HOST: "127.0.0.1" }), "127.0.0.1");
});
