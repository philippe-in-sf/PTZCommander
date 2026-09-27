import test from "node:test";
import assert from "node:assert/strict";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import {
  SecretDecryptionError,
  decryptSecretWithKeyring,
  encryptSecretWithKeyring,
  isEncryptedSecret,
  reencryptSecretWithKeyring,
  secretKeyringFromEnv,
  type SecretKeyring,
} from "../server/secrets";

const keyring: SecretKeyring = {
  activeId: "test-v2",
  keys: new Map([["test-v2", "test-key-material-with-more-than-32-characters"]]),
  legacyMaterials: ["legacy-session-secret"],
};

function legacyEncrypt(value: string, material: string) {
  const iv = randomBytes(12);
  const key = createHash("sha256").update(material).digest();
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `enc:v1:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${encrypted.toString("base64")}`;
}

test("secret helper encrypts and decrypts values", () => {
  const encrypted = encryptSecretWithKeyring("camera-password", keyring);

  assert.equal(isEncryptedSecret(encrypted), true);
  assert.match(encrypted || "", /^enc:v2:test-v2:/);
  assert.notEqual(encrypted, "camera-password");
  assert.equal(decryptSecretWithKeyring(encrypted, keyring), "camera-password");
});

test("secret helper keeps legacy plaintext readable", () => {
  assert.equal(decryptSecretWithKeyring("legacy-password", keyring), "legacy-password");
  assert.equal(decryptSecretWithKeyring(null, keyring), null);
});

test("legacy v1 credentials remain readable during migration", () => {
  const encrypted = legacyEncrypt("old-camera-password", "legacy-session-secret");
  assert.equal(decryptSecretWithKeyring(encrypted, keyring), "old-camera-password");
  const rotated = reencryptSecretWithKeyring(encrypted, keyring);
  assert.equal(rotated.changed, true);
  assert.match(rotated.value || "", /^enc:v2:test-v2:/);
  assert.equal(decryptSecretWithKeyring(rotated.value, keyring), "old-camera-password");
});

test("production can migrate credentials written by the original development fallback", () => {
  const encrypted = legacyEncrypt("old-development-password", "ptzcommand-dev-session-secret");
  const productionKeyring = secretKeyringFromEnv({
    NODE_ENV: "production",
    SESSION_SECRET: "a-production-session-secret-with-32-characters",
    SECRET_ENCRYPTION_KEY_ID: "prod-v1",
    SECRET_ENCRYPTION_KEY: "a-production-key-with-at-least-32-characters",
  });
  assert.equal(decryptSecretWithKeyring(encrypted, productionKeyring), "old-development-password");
});

test("unknown or wrong keys fail visibly", () => {
  const encrypted = encryptSecretWithKeyring("camera-password", keyring);
  const wrongKeyring: SecretKeyring = {
    activeId: "other",
    keys: new Map([["other", "another-long-test-key-material-value"]]),
    legacyMaterials: [],
  };
  assert.throws(() => decryptSecretWithKeyring(encrypted, wrongKeyring), SecretDecryptionError);
});

test("plaintext values that resemble an envelope are encrypted normally", () => {
  const plaintext = "enc:v2:not-a-real-envelope";
  const encrypted = encryptSecretWithKeyring(plaintext, keyring);
  assert.notEqual(encrypted, plaintext);
  assert.equal(decryptSecretWithKeyring(encrypted, keyring), plaintext);
});

test("a matching duplicate migration key is tolerated during atomic key-file swaps", () => {
  const configured = secretKeyringFromEnv({
    NODE_ENV: "production",
    SECRET_ENCRYPTION_KEY_ID: "prod-v2",
    SECRET_ENCRYPTION_KEY: "a-production-key-with-at-least-32-characters",
    SECRET_ENCRYPTION_PREVIOUS_KEYS: JSON.stringify({
      "prod-v2": "a-production-key-with-at-least-32-characters",
    }),
  });
  assert.equal(configured.keys.size, 1);
});

test("production requires independent encryption configuration", () => {
  assert.throws(() => secretKeyringFromEnv({ NODE_ENV: "production" }), /must be set/);
  const configured = secretKeyringFromEnv({
    NODE_ENV: "production",
    SECRET_ENCRYPTION_KEY_ID: "prod-v1",
    SECRET_ENCRYPTION_KEY: "a-production-key-with-at-least-32-characters",
  });
  assert.equal(configured.activeId, "prod-v1");
});
