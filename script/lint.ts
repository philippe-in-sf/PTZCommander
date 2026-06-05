import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { APP_VERSION } from "../shared/version";

const root = process.cwd();
const failures: string[] = [];

const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf-8"));
if (packageJson.version !== APP_VERSION) {
  failures.push(`package.json version ${packageJson.version} does not match APP_VERSION ${APP_VERSION}`);
}

const readme = readFileSync(join(root, "README.md"), "utf-8");
if (!readme.includes(`Current version: **${APP_VERSION}**`)) {
  failures.push(`README.md current version does not match APP_VERSION ${APP_VERSION}`);
}

for (const stalePath of [
  "attached_assets",
  "client/src/pages/displays 2.tsx",
  "dist 3",
  "dist.bad.2026-04-20",
]) {
  if (existsSync(join(root, stalePath))) {
    failures.push(`stale generated artifact is still present: ${stalePath}`);
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`lint: ${failure}`);
  }
  process.exit(1);
}

console.log("lint: project metadata and artifact checks passed");
