type ShutdownHandler = (reason: string) => Promise<void> | void;

let shutdownHandler: ShutdownHandler = () => {};
let terminating = false;
const SHUTDOWN_TIMEOUT_MS = 10_000;

function describeReason(reason: unknown) {
  if (reason instanceof Error) return reason.stack || reason.message;
  return String(reason);
}

async function terminate(reason: string, exitCode: number, error?: unknown) {
  if (terminating) return;
  terminating = true;

  const detail = error === undefined ? reason : `${reason}: ${describeReason(error)}`;
  console.error(`[fatal] ${detail}`);

  const timeout = new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, SHUTDOWN_TIMEOUT_MS);
    timer.unref();
  });

  try {
    await Promise.race([Promise.resolve(shutdownHandler(reason)), timeout]);
  } catch (shutdownError) {
    console.error(`[fatal] shutdown failed: ${describeReason(shutdownError)}`);
  } finally {
    process.exit(exitCode);
  }
}

process.on("uncaughtException", (error) => {
  void terminate("uncaughtException", 1, error);
});

process.on("unhandledRejection", (reason) => {
  void terminate("unhandledRejection", 1, reason);
});

process.on("SIGTERM", () => {
  void terminate("SIGTERM", 0);
});

process.on("SIGINT", () => {
  void terminate("SIGINT", 0);
});

export function setProcessShutdownHandler(handler: ShutdownHandler) {
  shutdownHandler = handler;
}

export function requestProcessShutdown(reason: string, exitCode = 1, error?: unknown) {
  return terminate(reason, exitCode, error);
}
