import test from "node:test";
import assert from "node:assert/strict";
import { decryptSecret, encryptSecret, isEncryptedSecret } from "../server/secrets";

test("secret helper encrypts and decrypts values", () => {
  const encrypted = encryptSecret("camera-password");

  assert.equal(isEncryptedSecret(encrypted), true);
  assert.notEqual(encrypted, "camera-password");
  assert.equal(decryptSecret(encrypted), "camera-password");
});

test("secret helper keeps legacy plaintext readable", () => {
  assert.equal(decryptSecret("legacy-password"), "legacy-password");
  assert.equal(decryptSecret(null), null);
});
