import { closeDatabase, pool, sqlite, useSqlite } from "../server/db";
import {
  decryptSecretWithKeyring,
  encryptSecretWithKeyring,
  secretKeyringFromEnv,
} from "../server/secrets";

const SECRET_COLUMNS = [
  { table: "cameras", columns: ["password"] },
  { table: "obs_connections", columns: ["password"] },
  { table: "hue_bridges", columns: ["api_key"] },
  {
    table: "display_devices",
    columns: [
      "smartthings_token",
      "smartthings_refresh_token",
      "smartthings_client_id",
      "smartthings_client_secret",
      "samsung_token",
      "hisense_username",
      "hisense_password",
    ],
  },
] as const;

type Rotation = { table: string; column: string; id: number; value: string };

function encryptedReplacement(value: unknown) {
  if (typeof value !== "string" || !value) return null;
  const keyring = secretKeyringFromEnv();
  if (value.startsWith(`enc:v2:${keyring.activeId}:`)) return null;
  const plaintext = decryptSecretWithKeyring(value, keyring);
  return plaintext ? encryptSecretWithKeyring(plaintext, keyring) : null;
}

async function buildRotationPlan() {
  const rotations: Rotation[] = [];
  for (const definition of SECRET_COLUMNS) {
    const columns = definition.columns.join(", ");
    const rows = useSqlite
      ? sqlite.prepare(`SELECT id, ${columns} FROM ${definition.table}`).all()
      : (await pool.query(`SELECT id, ${columns} FROM ${definition.table}`)).rows;

    for (const row of rows as Array<Record<string, unknown>>) {
      for (const column of definition.columns) {
        const value = encryptedReplacement(row[column]);
        if (value) rotations.push({ table: definition.table, column, id: Number(row.id), value });
      }
    }
  }
  return rotations;
}

async function applyRotationPlan(rotations: Rotation[]) {
  if (useSqlite) {
    const rotate = sqlite.transaction(() => {
      for (const item of rotations) {
        sqlite.prepare(`UPDATE ${item.table} SET ${item.column} = ? WHERE id = ?`).run(item.value, item.id);
      }
    });
    rotate();
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const item of rotations) {
      await client.query(`UPDATE ${item.table} SET ${item.column} = $1 WHERE id = $2`, [item.value, item.id]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function rotateSecrets() {
  const keyring = secretKeyringFromEnv();
  const rotations = await buildRotationPlan();
  await applyRotationPlan(rotations);
  console.log(`Rotated ${rotations.length} stored secret value(s) to key ID ${keyring.activeId}.`);
}

rotateSecrets()
  .catch((error) => {
    console.error(`Secret rotation failed and was rolled back: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(() => closeDatabase());
