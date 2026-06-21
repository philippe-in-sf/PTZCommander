const REQUIRED_NODE_MAJOR = 24;

const actualVersion = process.versions.node;
const actualMajor = Number.parseInt(actualVersion.split(".")[0] ?? "", 10);

if (actualMajor !== REQUIRED_NODE_MAJOR) {
  console.error(
    `ERROR: PTZ Command requires Node.js ${REQUIRED_NODE_MAJOR}.x. Current runtime is ${process.version}.`,
  );
  console.error(
    "Use the Node 24 binary for local runs, installs, tests, builds, and launchd installs; Node 26 breaks the native better-sqlite3 binding here.",
  );
  process.exit(1);
}

console.log(`Node.js ${process.version} matches required Node ${REQUIRED_NODE_MAJOR}.x.`);
