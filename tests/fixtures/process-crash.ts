import { writeFileSync } from "node:fs";
import { setProcessShutdownHandler } from "../../server/process-bootstrap";

const markerPath = process.argv[2];
setProcessShutdownHandler(() => {
  writeFileSync(markerPath, "shutdown-complete", "utf8");
});

setTimeout(() => {
  throw new Error("intentional crash for lifecycle test");
}, 0);
