import test from "node:test";
import assert from "node:assert/strict";
import { decryptSecret, encryptSecret, isEncryptedSecret, reencryptSecret } from "../server/secrets";

const ENV_KEYS = [
  "NODE_ENV",
  "SESSION_SECRET",
  "SECRET_ENCRYPTION_KEY",
  "SECRET_ENCRYPTION_PREVIOUS_KEY",
  "SECRET_ENCRYPTION_PREVIOUS_KEYS",
] as const;

function withEnv<T>(env: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>, callback: () => T) {
  const previous = new Map<(typeof ENV_KEYS)[number], string | undefined>();
  for (const key of ENV_KEYS) {
    previous.set(key, process.env[key]);
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) process.env[key] = value;
  }

  try {
    return callback();
  } finally {
    for (const key of ENV_KEYS) {
      const value = previous.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

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

test("secret helper requires a dedicated production encryption key", () => {
  withEnv({ NODE_ENV: "production", SESSION_SECRET: "session-only" }, () => {
    assert.throws(() => encryptSecret("camera-password"), /SECRET_ENCRYPTION_KEY must be set in production/);
  });
});

test("secret helper uses SECRET_ENCRYPTION_KEY separately from SESSION_SECRET", () => {
  withEnv(
    {
      NODE_ENV: "production",
      SESSION_SECRET: "session-secret",
      SECRET_ENCRYPTION_KEY: "credential-encryption-secret",
    },
    () => {
      const encrypted = encryptSecret("camera-password");

      assert.equal(isEncryptedSecret(encrypted), true);
      assert.equal(decryptSecret(encrypted), "camera-password");
    },
  );
});

test("secret helper decrypts previous-key values and re-encrypts them under the current key", () => {
  const oldEncrypted = withEnv(
    { NODE_ENV: "production", SECRET_ENCRYPTION_KEY: "old-credential-key" },
    () => encryptSecret("obs-password"),
  );

  const rotated = withEnv(
    {
      NODE_ENV: "production",
      SECRET_ENCRYPTION_KEY: "new-credential-key",
      SECRET_ENCRYPTION_PREVIOUS_KEY: "old-credential-key",
    },
    () => {
      assert.equal(decryptSecret(oldEncrypted), "obs-password");
      return reencryptSecret(oldEncrypted);
    },
  );

  assert.equal(rotated.changed, true);
  assert.notEqual(rotated.value, oldEncrypted);

  withEnv({ NODE_ENV: "production", SECRET_ENCRYPTION_KEY: "new-credential-key" }, () => {
    assert.equal(decryptSecret(rotated.value), "obs-password");
  });

  withEnv({ NODE_ENV: "production", SECRET_ENCRYPTION_KEY: "old-credential-key" }, () => {
    assert.equal(decryptSecret(rotated.value), null);
  });
});

test("secret helper preserves local dev credentials encrypted with the legacy fallback", () => {
  const oldEncrypted = withEnv(
    { NODE_ENV: "development", SECRET_ENCRYPTION_KEY: "ptzcommand-dev-session-secret" },
    () => encryptSecret("dev-camera-password"),
  );

  withEnv({ NODE_ENV: "development" }, () => {
    assert.equal(decryptSecret(oldEncrypted), "dev-camera-password");
    const rotated = reencryptSecret(oldEncrypted);
    assert.equal(rotated.changed, true);
    assert.equal(decryptSecret(rotated.value), "dev-camera-password");
  });
});
