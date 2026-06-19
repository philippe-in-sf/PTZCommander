const REQUIRED_NODE_MAJOR = 24;

const actualMajor = Number.parseInt(process.versions.node.split(".")[0] ?? "", 10);

if (actualMajor !== REQUIRED_NODE_MAJOR) {
  console.error(
    `ERROR: PTZ Command requires Node.js ${REQUIRED_NODE_MAJOR}.x. Current runtime is ${process.version}.`,
  );
  console.error(
    "Use the Node 24 binary; Node 26 is not compatible with this checkout's better-sqlite3 native binding.",
  );
  process.exit(1);
}
