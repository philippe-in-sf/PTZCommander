import express, { type Express } from "express";
import fs from "fs";
import { readFile, stat } from "fs/promises";
import path from "path";

const MIME_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readFileWithRetry(filePath: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await readFile(filePath);
    } catch (error: any) {
      lastError = error;
      if (error?.errno !== -11 && error?.code !== "EAGAIN") break;
      await sleep(25 * (attempt + 1));
    }
  }
  throw lastError;
}

function resolveStaticPath(distPath: string, requestPath: string) {
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(requestPath.split("?")[0] || "/");
  } catch {
    return null;
  }

  const resolvedPath = path.resolve(distPath, `.${decodedPath}`);
  if (resolvedPath !== distPath && !resolvedPath.startsWith(`${distPath}${path.sep}`)) {
    return null;
  }
  return resolvedPath;
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(async (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();

    const staticPath = resolveStaticPath(distPath, req.path);
    if (!staticPath) return res.status(400).send("Bad request");

    try {
      const fileStat = await stat(staticPath);
      if (!fileStat.isFile()) return next();

      const ext = path.extname(staticPath).toLowerCase();
      res.setHeader("Content-Type", MIME_TYPES[ext] || "application/octet-stream");
      res.setHeader("Content-Length", fileStat.size);
      res.setHeader("Cache-Control", "public, max-age=0");
      if (req.method === "HEAD") return res.end();

      const file = await readFileWithRetry(staticPath);
      return res.send(file);
    } catch (error: any) {
      if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return next();
      return next(error);
    }
  });

  // fall through to index.html if the file doesn't exist
  app.use("/{*path}", async (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();

    try {
      const indexPath = path.resolve(distPath, "index.html");
      const fileStat = await stat(indexPath);
      res.setHeader("Content-Type", MIME_TYPES[".html"]);
      res.setHeader("Content-Length", fileStat.size);
      res.setHeader("Cache-Control", "public, max-age=0");
      if (req.method === "HEAD") return res.end();

      const file = await readFileWithRetry(indexPath);
      return res.send(file);
    } catch (error) {
      return next(error);
    }
  });
}
