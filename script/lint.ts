import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { APP_VERSION } from "../shared/version";

const root = process.cwd();
const failures: string[] = [];
const REQUIRED_NODE_ENGINE = ">=24 <25";

const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf-8"));
if (packageJson.version !== APP_VERSION) {
  failures.push(`package.json version ${packageJson.version} does not match APP_VERSION ${APP_VERSION}`);
}

if (packageJson.engines?.node !== REQUIRED_NODE_ENGINE) {
  failures.push(`package.json engines.node must be ${REQUIRED_NODE_ENGINE}`);
}

const packageLockJson = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf-8"));
if (packageLockJson.packages?.[""]?.engines?.node !== REQUIRED_NODE_ENGINE) {
  failures.push(`package-lock.json root engines.node must be ${REQUIRED_NODE_ENGINE}`);
}

const nvmrc = readFileSync(join(root, ".nvmrc"), "utf-8").trim();
if (nvmrc !== "24") {
  failures.push(".nvmrc must pin Node major 24");
}

const nodeVersion = readFileSync(join(root, ".node-version"), "utf-8").trim();
if (nodeVersion !== "24") {
  failures.push(".node-version must pin Node major 24");
}

const npmrc = readFileSync(join(root, ".npmrc"), "utf-8");
if (!/^engine-strict=true$/m.test(npmrc)) {
  failures.push(".npmrc must enable engine-strict=true");
}

const readme = readFileSync(join(root, "README.md"), "utf-8");
if (!readme.includes(`Current version: **${APP_VERSION}**`)) {
  failures.push(`README.md current version does not match APP_VERSION ${APP_VERSION}`);
}

if (!readme.includes("Node.js 24.x")) {
  failures.push("README.md prerequisites must document Node.js 24.x");
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
