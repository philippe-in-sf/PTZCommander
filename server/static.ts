import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

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

type StaticAsset = {
  content: Buffer;
  contentType: string;
};

function pauseSync(ms: number) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // Short startup-only pause for transient filesystem read errors.
  }
}

function readFileWithRetrySync(filePath: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return fs.readFileSync(filePath);
    } catch (error: any) {
      lastError = error;
      if (error?.errno !== -11 && error?.code !== "EAGAIN") break;
      pauseSync(25 * (attempt + 1));
    }
  }
  throw lastError;
}

function loadStaticAssets(distPath: string) {
  const assets = new Map<string, StaticAsset>();

  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(entryPath);
        continue;
      }
      if (!entry.isFile()) continue;

      const relativePath = path.relative(distPath, entryPath).split(path.sep).join("/");
      const ext = path.extname(entryPath).toLowerCase();
      assets.set(`/${relativePath}`, {
        content: readFileWithRetrySync(entryPath),
        contentType: MIME_TYPES[ext] || "application/octet-stream",
      });
    }
  }

  walk(distPath);
  return assets;
}

function requestAssetPath(requestPath: string) {
  try {
    const decoded = decodeURIComponent(requestPath.split("?")[0] || "/");
    return decoded.startsWith("/") ? decoded : `/${decoded}`;
  } catch {
    return null;
  }
}

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

type StaticAsset = {
  content: Buffer;
  contentType: string;
};

function pauseSync(ms: number) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // Short startup-only pause for transient filesystem read errors.
  }
}

function readFileWithRetrySync(filePath: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return fs.readFileSync(filePath);
    } catch (error: any) {
      lastError = error;
      if (error?.errno !== -11 && error?.code !== "EAGAIN") break;
      pauseSync(25 * (attempt + 1));
    }
  }
  throw lastError;
}

function loadStaticAssets(distPath: string) {
  const assets = new Map<string, StaticAsset>();

  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(entryPath);
        continue;
      }
      if (!entry.isFile()) continue;

      const relativePath = path.relative(distPath, entryPath).split(path.sep).join("/");
      const ext = path.extname(entryPath).toLowerCase();
      assets.set(`/${relativePath}`, {
        content: readFileWithRetrySync(entryPath),
        contentType: MIME_TYPES[ext] || "application/octet-stream",
      });
    }
  }

  walk(distPath);
  return assets;
}

function requestAssetPath(requestPath: string) {
  try {
    const decoded = decodeURIComponent(requestPath.split("?")[0] || "/");
    return decoded.startsWith("/") ? decoded : `/${decoded}`;
  } catch {
    return null;
  }
}

export function serveStatic(app: Express) {
  const moduleDir = typeof __dirname !== "undefined"
    ? __dirname
    : path.dirname(fileURLToPath(new URL(import.meta.url)));
  const candidatePaths = [
    path.resolve(moduleDir, "public"),
    path.resolve(moduleDir, "..", "dist", "public"),
    path.resolve(process.cwd(), "dist", "public"),
  ];
  const distPath = candidatePaths.find((candidate) => fs.existsSync(candidate));
  if (!distPath) {
    throw new Error(
      `Could not find the build directory. Checked: ${candidatePaths.join(", ")}`,
    );
  }

  const assets = loadStaticAssets(distPath);
  const indexAsset = assets.get("/index.html");
  if (!indexAsset) {
    throw new Error(`Could not find index.html in the build directory: ${distPath}`);
  }

  function sendAsset(req: express.Request, res: express.Response, asset: StaticAsset) {
    res.setHeader("Content-Type", asset.contentType);
    res.setHeader("Content-Length", asset.content.length);
    res.setHeader("Cache-Control", "public, max-age=0");
    if (req.method === "HEAD") return res.end();
    return res.send(asset.content);
  }

  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();

    const assetPath = requestAssetPath(req.path);
    if (!assetPath) return res.status(400).send("Bad request");

    const asset = assets.get(assetPath);
    if (!asset) return next();
    return sendAsset(req, res, asset);
  });

  // fall through to index.html if the file doesn't exist
  app.use("/{*path}", (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    return sendAsset(req, res, indexAsset);
  });
}
