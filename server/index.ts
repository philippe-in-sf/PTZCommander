import "./node-version";
import { requestProcessShutdown, setProcessShutdownHandler } from "./process-bootstrap";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { attachCurrentUser, requireApiAccess, sessionMiddleware, validateAuthConfiguration } from "./auth";
import { csrfProtection } from "./csrf";
import { errorDetails, logger } from "./logger";
import { reencryptStoredSecrets } from "./storage";
import { configureExpressSecurity } from "./security";
import { closeDatabase } from "./db";
import { validateSecretConfiguration } from "./secrets";
import { resolveListenHost } from "./listen-host";

const app = express();
const httpServer = createServer(app);
configureExpressSecurity(app);
const SECRET_LOG_KEY_PATTERN = /(password|apiKey|token|secret)/i;

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));
app.use(sessionMiddleware);
app.use("/api", csrfProtection);
app.use(attachCurrentUser);
app.use(requireApiAccess);

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

function redactApiLogBody(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((item) => redactApiLogBody(item, depth + 1));
  }

  const redacted: Record<string, unknown> = {};
  for (const [key, childValue] of Object.entries(value)) {
    if (SECRET_LOG_KEY_PATTERN.test(key)) {
      redacted[key] = childValue ? "[redacted]" : childValue;
    } else {
      redacted[key] = redactApiLogBody(childValue, depth + 1);
    }
  }
  return redacted;
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(redactApiLogBody(capturedJsonResponse))}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  validateAuthConfiguration();
  validateSecretConfiguration();
  await reencryptStoredSecrets();
  const runtime = await registerRoutes(httpServer, app);

  setProcessShutdownHandler(async () => {
    await runtime.shutdown();
    await new Promise<void>((resolve) => {
      if (!httpServer.listening) return resolve();
      httpServer.close(() => resolve());
      httpServer.closeAllConnections();
    });
    await closeDatabase();
  });

  app.use((err: Error & { status?: number; statusCode?: number }, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    log(`Internal Server Error: ${message}`, "error");
    logger.error("api", `Unhandled request error: ${message}`, {
      action: "api_unhandled_error",
      details: {
        status,
        method: _req.method,
        path: _req.path,
        query: _req.query,
        ...errorDetails(err),
      },
    });

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  const nodeEnv = process.env.NODE_ENV || "development";
  if (nodeEnv === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const defaultPort = process.env.REPL_ID ? "5000" : "3478";
  const port = parseInt(process.env.PORT || defaultPort, 10);
  const host = resolveListenHost();
  
  httpServer.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      log(`Port ${port} is already in use.`, "error");
      log(`Possible solutions: 1. Use a different port: PORT=4000 npm run dev  2. Kill the process using port ${port}  3. On Mac: Disable AirPlay Receiver`, "error");
      void requestProcessShutdown("http_server_address_in_use", 1, err);
      return;
    }
    void requestProcessShutdown("http_server_error", 1, err);
  });

  httpServer.listen(port, host, () => {
    log(`serving on ${host}:${port}`);
  });
})().catch((error) => {
  void requestProcessShutdown("startup_failed", 1, error);
});
