import type { RouteContext } from "./types";
import { insertCameraSchema, insertPresetSchema, patchCameraSchema, patchPresetSchema } from "@shared/schema";
import type { Camera } from "@shared/schema";
import { errorDetails, logger } from "../logger";
import { fromError } from "zod-validation-error";
import { createHash } from "crypto";
import { spawn } from "child_process";
import type { ChildProcessWithoutNullStreams } from "child_process";
import type { Response } from "express";
import rateLimit from "express-rate-limit";
import net from "net";
import os from "os";
import { Readable } from "stream";
import { z } from "zod";
import { isRedactedSecret, publicCamera } from "./public-dtos";
import { registerApiAccessRule } from "../auth";
import { refreshPresetThumbnail } from "../preset-thumbnails";

const DEFAULT_VISCA_PORTS = [52381, 1259, 5678];
const VISCA_VERSION_INQUIRY = Buffer.from([0x81, 0x09, 0x00, 0x02, 0xff]);
const FFMPEG_PREVIEW_STARTUP_TIMEOUT_MS = 8000;
const FFMPEG_FRAME_CAPTURE_TIMEOUT_MS = 7000;
const FFMPEG_FRAME_CACHE_TTL_MS = 1200;
const FFMPEG_FRAME_STALE_TTL_MS = 30_000;
const FFMPEG_FRAME_MAX_BYTES = 8 * 1024 * 1024;
const ffmpegPreviewRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many network preview attempts; wait a minute and try again" },
});
const ffmpegFrameRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 360,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many camera frame attempts; wait a minute and try again" },
});
type FfmpegPreviewProtocol = "rtsp" | "rtp";
const FFMPEG_PREVIEW_FORCE_KILL_MS = 2000;
const FFMPEG_PREVIEW_IDLE_TIMEOUT_MS = 1500;

interface FfmpegPreviewHub {
  key: string;
  protocol: FfmpegPreviewProtocol;
  cameraId: number;
  cameraName: string;
  ffmpeg: ChildProcessWithoutNullStreams;
  clients: Set<Response>;
  started: boolean;
  closed: boolean;
  stderr: string;
  startupTimer: NodeJS.Timeout | null;
  idleTimer: NodeJS.Timeout | null;
}

const activeFfmpegPreviewSessions = new Map<string, FfmpegPreviewHub>();

interface FfmpegFrameCacheEntry {
  buffer: Buffer;
  capturedAt: number;
}

const ffmpegFrameCache = new Map<string, FfmpegFrameCacheEntry>();
const activeFfmpegFrameCaptures = new Map<string, Promise<FfmpegFrameCacheEntry>>();

type DiscoveryConfidence = "confirmed" | "port-open";

interface DiscoveredCamera {
  ip: string;
  port: number;
  protocol: "visca";
  confidence: DiscoveryConfidence;
  name: string;
  alreadyConfigured: boolean;
}

const discoverSchema = z.object({
  subnet: z.string().optional(),
  subnets: z.array(z.string()).max(4).optional(),
  ports: z.array(z.number().int().min(1).max(65535)).max(12).optional(),
  timeoutMs: z.number().int().min(100).max(2000).optional(),
});

const importDiscoveredSchema = z.object({
  cameras: z.array(z.object({
    ip: z.string().min(7),
    port: z.number().int().min(1).max(65535),
    name: z.string().optional(),
    streamUrl: z.string().optional().nullable(),
  })).min(1).max(64),
});

const webrtcOfferSchema = z.object({
  sdp: z.string().min(1),
});

function cameraAuthHeaders(camera: { username: string | null; password: string | null }) {
  return camera.username
    ? { Authorization: "Basic " + Buffer.from(`${camera.username}:${camera.password || ""}`).toString("base64") }
    : {};
}

function getFfmpegPath() {
  return "ffmpeg";
}

function normalizeFfmpegPreviewUrl(value: string, protocol: FfmpegPreviewProtocol) {
  try {
    if (/[\u0000-\u001f\s]/.test(value)) return null;
    const url = new URL(value);
    if (protocol === "rtsp" && url.protocol !== "rtsp:" && url.protocol !== "rtsps:") return null;
    if (protocol === "rtp" && url.protocol !== "rtp:") return null;
    if (!url.hostname) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function isConfiguredFfmpegPreviewTarget(
  value: string,
  camera: { ip: string },
) {
  try {
    const url = new URL(value);
    return url.hostname.toLowerCase() === camera.ip.trim().toLowerCase();
  } catch {
    return false;
  }
}

function assertConfiguredFfmpegPreviewTarget(
  normalizedUrl: string,
  camera: { name: string; ip: string },
  protocol: FfmpegPreviewProtocol,
) {
  if (isConfiguredFfmpegPreviewTarget(normalizedUrl, camera)) return;
  throw new CameraPreviewCaptureError(
    `${protocol.toUpperCase()} preview URL host must match the configured camera host for ${camera.name}`,
    400,
  );
}

function applyCameraCredentialsToPreviewUrl(
  value: string,
  camera: { username: string | null; password: string | null },
) {
  try {
    const url = new URL(value);
    if (!camera.username) return url.toString();
    if (url.username || url.password) return url.toString();
    url.username = camera.username;
    url.password = camera.password || "";
    return url.toString();
  } catch {
    return value;
  }
}

function redactPreviewUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.username) url.username = "redacted";
    if (url.password) url.password = "redacted";
    return url.toString();
  } catch {
    return value.replace(/\/\/([^/@:]+):([^/@]+)@/, "//redacted:redacted@");
  }
}

function redactFfmpegPreviewDiagnostics(value: string) {
  return value.replace(/((?:rtsps?|rtp):\/\/)([^/\s:@]+):([^/\s@]+)@/gi, "$1redacted:redacted@");
}

function ffmpegPreviewErrorMessage(stderr: string, protocol: FfmpegPreviewProtocol) {
  const message = redactFfmpegPreviewDiagnostics(stderr).trim().split("\n").pop() || "";
  if (/ffmpeg: not found/i.test(message)) return "FFmpeg is not installed on the app host";
  return message || `${protocol.toUpperCase()} preview ended before video was available`;
}

function ffmpegFrameErrorMessage(error: unknown, protocol: FfmpegPreviewProtocol) {
  const message = error instanceof Error ? error.message : String(error || "");
  return redactFfmpegPreviewDiagnostics(message).trim() || `${protocol.toUpperCase()} frame capture failed`;
}

function ffmpegFrameCacheKey(
  protocol: FfmpegPreviewProtocol,
  cameraId: number,
  normalizedUrl: string,
  camera: { username: string | null; password: string | null },
) {
  const digest = createHash("sha256")
    .update(normalizedUrl)
    .update("\0")
    .update(camera.username || "")
    .update("\0")
    .update(camera.password || "")
    .digest("hex")
    .slice(0, 16);
  return `${protocol}:${cameraId}:${digest}`;
}

function captureFfmpegFrame(ffmpegPath: string, inputUrl: string, protocol: FfmpegPreviewProtocol) {
  return new Promise<Buffer>((resolve, reject) => {
    const args = [
      "-hide_banner",
      "-loglevel",
      "warning",
      "-nostdin",
      ...(protocol === "rtsp" ? ["-rtsp_transport", "tcp", "-timeout", "5000000"] : []),
      "-i",
      inputUrl,
      "-map",
      "0:v:0",
      "-an",
      "-sn",
      "-dn",
      "-frames:v",
      "1",
      "-q:v",
      "4",
      "-f",
      "image2pipe",
      "-vcodec",
      "mjpeg",
      "pipe:1",
    ];

    const ffmpeg = spawn(ffmpegPath, args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      env: process.env,
    }) as unknown as ChildProcessWithoutNullStreams;

    const stdout: Buffer[] = [];
    let stderr = "";
    let bytes = 0;
    let settled = false;
    let timeout: NodeJS.Timeout;

    const finish = (error: Error | null, frame?: Buffer) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error && !ffmpeg.killed) {
        ffmpeg.kill("SIGTERM");
        setTimeout(() => {
          if (!ffmpeg.killed) ffmpeg.kill("SIGKILL");
        }, FFMPEG_PREVIEW_FORCE_KILL_MS).unref();
      }
      if (error) reject(error);
      else resolve(frame || Buffer.alloc(0));
    };

    timeout = setTimeout(() => {
      finish(new Error(`${protocol.toUpperCase()} frame capture timed out`));
    }, FFMPEG_FRAME_CAPTURE_TIMEOUT_MS);

    ffmpeg.stdout.on("data", (chunk: Buffer) => {
      if (settled) return;
      bytes += chunk.length;
      if (bytes > FFMPEG_FRAME_MAX_BYTES) {
        finish(new Error(`${protocol.toUpperCase()} frame exceeded ${FFMPEG_FRAME_MAX_BYTES} bytes`));
        return;
      }
      stdout.push(chunk);
    });

    ffmpeg.stderr.on("data", (chunk) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-4000);
    });

    ffmpeg.once("error", (error: NodeJS.ErrnoException) => {
      finish(error.code === "ENOENT"
        ? new Error("FFmpeg is not installed on the app host")
        : new Error(error.message || `Failed to start ${protocol.toUpperCase()} frame capture`));
    });

    ffmpeg.once("close", (code, signal) => {
      if (settled) return;
      const frame = Buffer.concat(stdout);
      if (code === 0 && frame.length > 0) {
        finish(null, frame);
        return;
      }

      const diagnostic = redactFfmpegPreviewDiagnostics(stderr).trim().split("\n").pop();
      finish(new Error(diagnostic || `${protocol.toUpperCase()} frame capture exited with ${code ?? signal ?? "no frame"}`));
    });
  });
}

async function getFfmpegFrame(
  ffmpegPath: string,
  protocol: FfmpegPreviewProtocol,
  cameraId: number,
  normalizedUrl: string,
  inputUrl: string,
  camera: { username: string | null; password: string | null },
) {
  const key = ffmpegFrameCacheKey(protocol, cameraId, normalizedUrl, camera);
  const now = Date.now();
  const cached = ffmpegFrameCache.get(key);
  if (cached && now - cached.capturedAt < FFMPEG_FRAME_CACHE_TTL_MS) {
    return { entry: cached, stale: false };
  }

  let capture = activeFfmpegFrameCaptures.get(key);
  if (!capture) {
    capture = captureFfmpegFrame(ffmpegPath, inputUrl, protocol)
      .then((buffer) => {
        const entry = { buffer, capturedAt: Date.now() };
        ffmpegFrameCache.set(key, entry);
        return entry;
      })
      .finally(() => {
        activeFfmpegFrameCaptures.delete(key);
      });
    activeFfmpegFrameCaptures.set(key, capture);
  }

  try {
    return { entry: await capture, stale: false };
  } catch (error) {
    const stale = ffmpegFrameCache.get(key);
    if (stale && Date.now() - stale.capturedAt < FFMPEG_FRAME_STALE_TTL_MS) {
      return { entry: stale, stale: true, error };
    }
    throw error;
  }
}

class CameraPreviewCaptureError extends Error {
  constructor(message: string, readonly statusCode = 502) {
    super(message);
    this.name = "CameraPreviewCaptureError";
  }
}

interface SnapshotPreviewFrame {
  buffer: Buffer;
  contentType: string;
}

type FfmpegFrameCapture = (camera: Camera, protocol: FfmpegPreviewProtocol) => Promise<Buffer>;

interface PreviewThumbnailCaptureDeps {
  fetchImpl?: typeof fetch;
  captureFfmpegFrame?: FfmpegFrameCapture;
}

function imageDataUri(buffer: Buffer, contentType = "image/jpeg") {
  return `data:${contentType};base64,${buffer.toString("base64")}`;
}

async function captureSnapshotPreviewFrame(
  camera: Camera,
  fetchImpl: typeof fetch = fetch,
): Promise<SnapshotPreviewFrame> {
  if (!camera.streamUrl) {
    throw new CameraPreviewCaptureError("No stream URL configured", 404);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetchImpl(camera.streamUrl, {
      signal: controller.signal,
      headers: cameraAuthHeaders(camera) as Record<string, string>,
    });

    if (!response.ok) {
      throw new CameraPreviewCaptureError(`Camera returned ${response.status}`, 502);
    }

    return {
      buffer: Buffer.from(await response.arrayBuffer()),
      contentType: response.headers.get("content-type") || "image/jpeg",
    };
  } catch (error) {
    if (error instanceof CameraPreviewCaptureError) {
      throw error;
    }

    const errorName = error instanceof Error ? error.name : "";
    if (errorName === "AbortError") {
      throw new CameraPreviewCaptureError("Camera snapshot timed out", 504);
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new CameraPreviewCaptureError(`Failed to reach camera: ${message}`, 502);
  } finally {
    clearTimeout(timeout);
  }
}

async function captureFfmpegFrameForCameraResult(camera: Camera, protocol: FfmpegPreviewProtocol) {
  if (!camera.streamUrl) {
    throw new CameraPreviewCaptureError(`No ${protocol.toUpperCase()} URL configured`, 404);
  }

  const normalizedUrl = normalizeFfmpegPreviewUrl(camera.streamUrl, protocol);
  if (!normalizedUrl) {
    const allowed = protocol === "rtsp" ? "rtsp:// or rtsps://" : "rtp://";
    throw new CameraPreviewCaptureError(`${protocol.toUpperCase()} frame URLs must start with ${allowed}`, 400);
  }
  assertConfiguredFfmpegPreviewTarget(normalizedUrl, camera, protocol);

  const inputUrl = applyCameraCredentialsToPreviewUrl(normalizedUrl, camera);
  return getFfmpegFrame(getFfmpegPath(), protocol, camera.id, normalizedUrl, inputUrl, camera);
}

async function captureFfmpegFrameForCamera(camera: Camera, protocol: FfmpegPreviewProtocol) {
  const result = await captureFfmpegFrameForCameraResult(camera, protocol);
  return result.entry.buffer;
}

export async function captureConfiguredPreviewThumbnail(
  camera: Camera,
  deps: PreviewThumbnailCaptureDeps = {},
) {
  if (!camera.streamUrl) {
    return null;
  }

  const previewType = camera.previewType || (camera.streamUrl ? "snapshot" : "none");

  try {
    if (previewType === "snapshot") {
      const frame = await captureSnapshotPreviewFrame(camera, deps.fetchImpl);
      return imageDataUri(frame.buffer, frame.contentType);
    }

    if (previewType === "rtsp" || previewType === "rtp") {
      const captureFrame = deps.captureFfmpegFrame || captureFfmpegFrameForCamera;
      const frame = await captureFrame(camera, previewType);
      return imageDataUri(frame);
    }

    return null;
  } catch {
    return null;
  }
}

function previewSessionKey(
  protocol: FfmpegPreviewProtocol,
  cameraId: number,
  _request: { ip?: string; headers: { [key: string]: string | string[] | undefined } },
) {
  return `${protocol}:${cameraId}`;
}

function stopPreviewHub(hub: FfmpegPreviewHub) {
  if (hub.closed) return;
  hub.closed = true;
  if (hub.startupTimer) {
    clearTimeout(hub.startupTimer);
    hub.startupTimer = null;
  }
  if (hub.idleTimer) {
    clearTimeout(hub.idleTimer);
    hub.idleTimer = null;
  }
  if (!hub.ffmpeg.killed) {
    hub.ffmpeg.kill("SIGTERM");
    setTimeout(() => {
      if (!hub.ffmpeg.killed) {
        hub.ffmpeg.kill("SIGKILL");
      }
    }, FFMPEG_PREVIEW_FORCE_KILL_MS).unref();
  }
}

function attachPreviewHeaders(res: Response) {
  if (res.headersSent || res.destroyed) return;
  res.setHeader("Content-Type", "multipart/x-mixed-replace; boundary=frame");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Connection", "close");
}

function detachPreviewClient(hub: FfmpegPreviewHub, res: Response) {
  hub.clients.delete(res);
  if (hub.clients.size > 0 || hub.closed) return;
  if (hub.idleTimer) clearTimeout(hub.idleTimer);
  hub.idleTimer = setTimeout(() => stopPreviewHub(hub), FFMPEG_PREVIEW_IDLE_TIMEOUT_MS);
  hub.idleTimer.unref();
}

function broadcastPreviewChunk(hub: FfmpegPreviewHub, chunk: Buffer) {
  for (const client of Array.from(hub.clients)) {
    if (client.destroyed) {
      detachPreviewClient(hub, client);
      continue;
    }
    attachPreviewHeaders(client);
    try {
      client.write(chunk);
    } catch {
      detachPreviewClient(hub, client);
    }
  }
}

function ipv4ToInt(ip: string) {
  return ip.split(".").reduce((acc, part) => ((acc << 8) + Number(part)) >>> 0, 0);
}

function intToIpv4(value: number) {
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join(".");
}

function isPrivateIpv4(ip: string) {
  return ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip);
}

function getDefaultSubnets() {
  const subnets = new Set<string>();
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family !== "IPv4" || entry.internal || !isPrivateIpv4(entry.address)) continue;
      const parts = entry.address.split(".");
      subnets.add(`${parts[0]}.${parts[1]}.${parts[2]}.0/24`);
    }
  }
  return Array.from(subnets);
}

function hostsForSubnet(cidr: string) {
  const match = cidr.trim().match(/^(\d{1,3}(?:\.\d{1,3}){3})(?:\/(\d{1,2}))?$/);
  if (!match) throw new Error(`Invalid subnet: ${cidr}`);

  const baseIp = match[1];
  const octets = baseIp.split(".").map(Number);
  if (octets.some((octet) => Number.isNaN(octet) || octet < 0 || octet > 255)) {
    throw new Error(`Invalid subnet: ${cidr}`);
  }

  const prefix = match[2] ? Number(match[2]) : 24;
  if (prefix < 24 || prefix > 30) {
    throw new Error("Discovery supports /24 through /30 subnets to keep scans bounded");
  }

  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const network = ipv4ToInt(baseIp) & mask;
  const broadcast = network | (~mask >>> 0);
  const hosts: string[] = [];
  for (let value = network + 1; value < broadcast; value++) {
    hosts.push(intToIpv4(value >>> 0));
  }
  return hosts;
}

function probeViscaEndpoint(ip: string, port: number, timeoutMs: number): Promise<DiscoveryConfidence | null> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    let responseTimer: NodeJS.Timeout | null = null;

    const finish = (confidence: DiscoveryConfidence | null) => {
      if (settled) return;
      settled = true;
      if (responseTimer) clearTimeout(responseTimer);
      socket.destroy();
      resolve(confidence);
    };

    const timeout = setTimeout(() => finish(null), timeoutMs);

    socket.setNoDelay(true);
    socket.once("connect", () => {
      clearTimeout(timeout);
      socket.write(VISCA_VERSION_INQUIRY, () => {
        responseTimer = setTimeout(() => finish("port-open"), Math.min(250, Math.max(100, timeoutMs)));
      });
    });
    socket.on("data", (chunk) => {
      finish(chunk.includes(0xff) ? "confirmed" : "port-open");
    });
    socket.once("error", () => finish(null));
    socket.once("close", () => {
      if (!settled) finish(null);
    });
    socket.connect(port, ip);
  });
}

async function runWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>) {
  const results: R[] = [];
  let index = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index++];
      results.push(await worker(current));
    }
  });
  await Promise.all(workers);
  return results;
}

export function registerCameraRoutes(ctx: RouteContext) {
  const { app, storage, cameraManager, broadcast, pushUndo, addSessionLog, captureSnapshot } = ctx;
  registerApiAccessRule(["POST"], /^\/api\/cameras\/\d+\/webrtc\/offer$/, "viewer");
  registerApiAccessRule(["POST"], /^\/api\/cameras\/\d+\/program$/, "operator");
  registerApiAccessRule(["POST"], /^\/api\/cameras\/\d+\/preview$/, "operator");
  registerApiAccessRule(["PATCH", "POST", "DELETE"], /^\/api\/presets(?:\/\d+)?(?:\/(?:recall|thumbnail))?$/, "operator");

  app.get("/api/cameras", async (_req, res) => {
    try {
      const cameras = await storage.getAllCameras();
      res.json(cameras.map(publicCamera));
    } catch (error) {
      res.status(500).json({ message: "Failed to get cameras" });
    }
  });

  app.post("/api/cameras/discover", async (req, res) => {
    try {
      const parsed = discoverSchema.safeParse(req.body || {});
      if (!parsed.success) {
        return res.status(400).json({ message: fromError(parsed.error).toString() });
      }

      const subnets = parsed.data.subnets?.length
        ? parsed.data.subnets
        : parsed.data.subnet
          ? [parsed.data.subnet]
          : getDefaultSubnets();
      if (subnets.length === 0) {
        return res.status(400).json({ message: "No local private IPv4 subnet found. Enter a subnet manually, for example 192.168.0.0/24." });
      }

      const ports = Array.from(new Set(parsed.data.ports?.length ? parsed.data.ports : DEFAULT_VISCA_PORTS));
      const timeoutMs = parsed.data.timeoutMs ?? 350;
      const existing = await storage.getAllCameras();
      const existingIps = new Set(existing.map((camera) => camera.ip));
      let hosts: string[];
      try {
        hosts = Array.from(new Set(subnets.flatMap(hostsForSubnet)));
      } catch (error: any) {
        return res.status(400).json({ message: error.message || "Invalid discovery subnet" });
      }
      const targets = hosts.flatMap((ip) => ports.map((port) => ({ ip, port })));

      const probes = await runWithConcurrency(targets, 64, async (target) => {
        const confidence = await probeViscaEndpoint(target.ip, target.port, timeoutMs);
        return confidence ? { ...target, confidence } : null;
      });

      const confidenceRank: Record<DiscoveryConfidence, number> = { confirmed: 0, "port-open": 1 };
      const preferredPorts = [52381, 5678, 1259];
      const portPreference = new Map(preferredPorts.map((port, index) => [port, index]));
      const bestProbeByIp = new Map<string, { ip: string; port: number; confidence: DiscoveryConfidence }>();
      for (const probe of probes.filter((probe): probe is { ip: string; port: number; confidence: DiscoveryConfidence } => !!probe)) {
        const current = bestProbeByIp.get(probe.ip);
        if (!current) {
          bestProbeByIp.set(probe.ip, probe);
          continue;
        }

        const probeRank = confidenceRank[probe.confidence];
        const currentRank = confidenceRank[current.confidence];
        const probePortRank = portPreference.get(probe.port) ?? preferredPorts.length;
        const currentPortRank = portPreference.get(current.port) ?? preferredPorts.length;
        if (
          probeRank < currentRank ||
          (probeRank === currentRank && probePortRank < currentPortRank) ||
          (probeRank === currentRank && probePortRank === currentPortRank && probe.port < current.port)
        ) {
          bestProbeByIp.set(probe.ip, probe);
        }
      }

      const discovered = Array.from(bestProbeByIp.values())
        .sort((a, b) => ipv4ToInt(a.ip) - ipv4ToInt(b.ip))
        .map<DiscoveredCamera>((probe, index) => ({
          ip: probe.ip,
          port: probe.port,
          protocol: "visca",
          confidence: probe.confidence,
          name: `Camera ${index + 1}`,
          alreadyConfigured: existingIps.has(probe.ip),
        }));

      logger.info("camera", `VISCA discovery scan complete: ${discovered.length} candidate(s)`, {
        action: "camera:discover",
        details: { subnets, ports, timeoutMs, targets: targets.length, discovered: discovered.length },
      });
      res.json({ subnets, ports, timeoutMs, cameras: discovered });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to discover cameras" });
    }
  });

  app.post("/api/cameras/import-discovered", async (req, res) => {
    try {
      const parsed = importDiscoveredSchema.safeParse(req.body || {});
      if (!parsed.success) {
        return res.status(400).json({ message: fromError(parsed.error).toString() });
      }

      const existing = await storage.getAllCameras();
      const existingIps = new Set(existing.map((camera) => camera.ip));
      const added = [];
      const skipped: { ip: string; port: number; reason: string }[] = [];

      for (const candidate of parsed.data.cameras) {
        if (existingIps.has(candidate.ip)) {
          skipped.push({ ip: candidate.ip, port: candidate.port, reason: "already configured" });
          continue;
        }

        const camera = await storage.createCamera({
          name: candidate.name?.trim() || `Camera ${existing.length + added.length + 1}`,
          ip: candidate.ip,
          port: candidate.port,
          protocol: "visca",
          streamUrl: candidate.streamUrl || null,
          previewType: candidate.streamUrl ? "snapshot" : "none",
        });
        existingIps.add(candidate.ip);
        const connected = await cameraManager.connectCamera(camera.id, camera.ip, camera.port);
        await storage.updateCameraStatus(camera.id, connected ? "online" : "offline");
        added.push(await storage.getCamera(camera.id) || camera);
      }

      if (added.length > 0) {
        logger.info("camera", `Imported ${added.length} discovered camera(s)`, {
          action: "camera:import_discovered",
          details: { added: added.map((camera) => ({ id: camera.id, ip: camera.ip, port: camera.port })) },
        });
        broadcast({ type: "invalidate", keys: ["cameras"] });
      }
      res.json({ added: added.map(publicCamera), skipped });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to import discovered cameras" });
    }
  });

  app.get("/api/cameras/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const camera = await storage.getCamera(id);
      if (!camera) {
        return res.status(404).json({ message: "Camera not found" });
      }
      res.json(publicCamera(camera));
    } catch (error) {
      res.status(500).json({ message: "Failed to get camera" });
    }
  });

  app.post("/api/cameras", async (req, res) => {
    try {
      const result = insertCameraSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: fromError(result.error).toString() });
      }
      const camera = await storage.createCamera({
        ...result.data,
        previewType: result.data.previewType ?? (result.data.streamUrl ? "snapshot" : "none"),
        previewRefreshMs: result.data.previewRefreshMs ?? 2000,
      });
      logger.info("camera", `Camera created: ${camera.name}`, { action: "camera:create", details: { cameraId: camera.id, name: camera.name, ip: camera.ip } });
      const connected = await cameraManager.connectCamera(camera.id, camera.ip, camera.port);
      await storage.updateCameraStatus(camera.id, connected ? "online" : "offline");
      broadcast({ type: "invalidate", keys: ["cameras"] });
      res.json(publicCamera(await storage.getCamera(camera.id) || camera));
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to create camera" });
    }
  });

  app.patch("/api/cameras/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const body = { ...req.body };
      if (isRedactedSecret(body.password)) delete body.password;
      const result = patchCameraSchema.safeParse(body);
      if (!result.success) {
        return res.status(400).json({ message: fromError(result.error).toString() });
      }
      const previousCamera = await storage.getCamera(id);
      if (!previousCamera) {
        return res.status(404).json({ message: "Camera not found" });
      }

      const camera = await storage.updateCamera(id, result.data);
      if (!camera) {
        return res.status(404).json({ message: "Camera not found" });
      }
      const assignmentChanged = previousCamera.name !== camera.name;
      const atemInputChanged = previousCamera.atemInputId !== camera.atemInputId;

      if (assignmentChanged || atemInputChanged) {
        logger.info("camera", "Camera assignment or ATEM input changed", {
          action: "camera:assignment_atem_update",
          details: {
            cameraId: camera.id,
            previousName: previousCamera.name,
            name: camera.name,
            previousAtemInputId: previousCamera.atemInputId ?? null,
            atemInputId: camera.atemInputId ?? null,
          },
        });
      }
      if (
        result.data.ip !== undefined ||
        result.data.port !== undefined ||
        result.data.protocol !== undefined
      ) {
        cameraManager.disconnectCamera(id);
        const connected = await cameraManager.connectCamera(camera.id, camera.ip, camera.port);
        await storage.updateCameraStatus(camera.id, connected ? "online" : "offline");
        logger.info("camera", `Camera connection refreshed after settings update: ${camera.name}`, {
          action: "camera:reconnect_after_update",
          details: {
            cameraId: camera.id,
            previousIp: previousCamera.ip,
            previousPort: previousCamera.port,
            ip: camera.ip,
            port: camera.port,
            connected,
          },
        });
      }
      broadcast({ type: "invalidate", keys: ["cameras"] });
      res.json(publicCamera(await storage.getCamera(id) || camera));
    } catch (error) {
      res.status(500).json({ message: "Failed to update camera" });
    }
  });

  app.patch("/api/presets/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const result = patchPresetSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: fromError(result.error).toString() });
      }
      const preset = await storage.getPresetById(id);
      if (!preset) {
        return res.status(404).json({ message: "Preset not found" });
      }
      const updated = await storage.savePreset({ ...preset, ...result.data });
      broadcast({ type: "invalidate", keys: ["presets"] });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update preset" });
    }
  });

  app.delete("/api/cameras/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      cameraManager.disconnectCamera(id);
      const camPresets = await storage.getPresetsForCamera(id);
      for (const p of camPresets) await storage.deletePreset(p.id);
      await storage.deleteCamera(id);
      logger.info("camera", `Camera deleted`, { action: "camera:delete", details: { cameraId: id } });
      broadcast({ type: "invalidate", keys: ["cameras"] });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete camera" });
    }
  });

  app.post("/api/cameras/:id/program", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.setProgramCamera(id);
      logger.info("camera", `Camera set to program`, { action: "camera:program", details: { cameraId: id } });
      broadcast({ type: "invalidate", keys: ["cameras"] });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to set program camera" });
    }
  });

  app.post("/api/cameras/:id/preview", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.setPreviewCamera(id);
      logger.info("camera", `Camera set to preview`, { action: "camera:preview", details: { cameraId: id } });
      broadcast({ type: "invalidate", keys: ["cameras"] });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to set preview camera" });
    }
  });

  app.get("/api/cameras/:id/snapshot", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const camera = await storage.getCamera(id);
      if (!camera) return res.status(404).json({ message: "Camera not found" });

      const frame = await captureSnapshotPreviewFrame(camera);
      res.setHeader("Content-Type", frame.contentType);
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.send(frame.buffer);
    } catch (error: any) {
      if (error instanceof CameraPreviewCaptureError) {
        return res.status(error.statusCode).json({ message: error.message });
      }
      res.status(500).json({ message: error.message || "Failed to get snapshot" });
    }
  });

  app.get("/api/cameras/:id/preview-stream", async (req, res) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const id = parseInt(req.params.id);
      const camera = await storage.getCamera(id);
      if (!camera) return res.status(404).json({ message: "Camera not found" });
      if (!camera.streamUrl) return res.status(404).json({ message: "No preview URL configured" });

      const abortPreviewStream = () => controller.abort();
      req.on("aborted", abortPreviewStream);
      res.on("close", abortPreviewStream);

      const response = await fetch(camera.streamUrl, {
        signal: controller.signal,
        headers: cameraAuthHeaders(camera) as Record<string, string>,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        return res.status(502).json({ message: `Camera returned ${response.status}` });
      }
      if (!response.body) {
        return res.status(502).json({ message: "Camera returned an empty stream" });
      }

      res.setHeader("Content-Type", response.headers.get("content-type") || "multipart/x-mixed-replace");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      Readable.fromWeb(response.body as any).on("error", () => res.end()).pipe(res);
    } catch (error: any) {
      clearTimeout(timeout);
      if (error.name === "AbortError" && !res.headersSent) {
        return res.status(504).json({ message: "Camera preview stream timed out" });
      }
      if (!res.headersSent) {
        res.status(502).json({ message: error.message || "Failed to open camera preview stream" });
      } else {
        res.end();
      }
    }
  });

  const registerFfmpegFrameRoute = (routePath: string, protocol: FfmpegPreviewProtocol) => {
    app.get(routePath, ffmpegFrameRateLimiter, async (req, res) => {
      const label = protocol.toUpperCase();
      try {
        const id = parseInt(String(req.params.id));
        const camera = await storage.getCamera(id);
        if (!camera) return res.status(404).json({ message: "Camera not found" });

        const result = await captureFfmpegFrameForCameraResult(camera, protocol);
        const error = "error" in result ? result.error : undefined;

        res.setHeader("Content-Type", "image/jpeg");
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        if (result.stale) {
          res.setHeader("X-PTZ-Preview-Stale", "true");
          res.setHeader("X-PTZ-Preview-Stale-Age-Ms", String(Date.now() - result.entry.capturedAt));
          if (error) {
            res.setHeader("X-PTZ-Preview-Error", ffmpegFrameErrorMessage(error, protocol).slice(0, 240));
          }
        }
        res.send(result.entry.buffer);
      } catch (error: any) {
        if (error instanceof CameraPreviewCaptureError) {
          return res.status(error.statusCode).json({ message: error.message });
        }
        logger.warn("camera", `${label} frame capture failed`, {
          action: `camera:${protocol}_frame_failed`,
          details: {
            cameraId: req.params.id,
            message: ffmpegFrameErrorMessage(error, protocol),
          },
        });
        res.status(502).json({ message: ffmpegFrameErrorMessage(error, protocol) });
      }
    });
  };

  const registerFfmpegPreviewStreamRoute = (routePath: string, protocol: FfmpegPreviewProtocol) => {
    app.get(routePath, ffmpegPreviewRateLimiter, async (req, res) => {
      const label = protocol.toUpperCase();
      try {
        const id = parseInt(String(req.params.id));
        const camera = await storage.getCamera(id);
        if (!camera) return res.status(404).json({ message: "Camera not found" });
        if (!camera.streamUrl) return res.status(404).json({ message: `No ${label} URL configured` });
        const normalizedUrl = normalizeFfmpegPreviewUrl(camera.streamUrl, protocol);
        if (!normalizedUrl) {
          const allowed = protocol === "rtsp" ? "rtsp:// or rtsps://" : "rtp://";
          return res.status(400).json({ message: `${label} preview URLs must start with ${allowed}` });
        }
        if (!isConfiguredFfmpegPreviewTarget(normalizedUrl, camera)) {
          return res.status(400).json({
            message: `${label} preview URL host must match the configured camera host for ${camera.name}`,
          });
        }

        const inputUrl = applyCameraCredentialsToPreviewUrl(normalizedUrl, camera);
        const ffmpegPath = getFfmpegPath();
        const sessionKey = previewSessionKey(protocol, camera.id, req);
        let hub = activeFfmpegPreviewSessions.get(sessionKey);

        if (!hub) {
          const ffmpegArgs = [
            "-hide_banner",
            "-loglevel",
            "warning",
            ...(protocol === "rtsp" ? ["-rtsp_transport", "tcp"] : []),
            "-i",
            inputUrl,
            "-an",
            "-sn",
            "-dn",
            "-r",
            "12",
            "-q:v",
            "6",
            "-f",
            "mpjpeg",
            "-boundary_tag",
            "frame",
            "pipe:1",
          ];

          logger.info("camera", `Opening ${label} preview for ${camera.name}`, {
            action: `camera:${protocol}_preview_start`,
            details: {
              cameraId: camera.id,
              name: camera.name,
              url: redactPreviewUrl(inputUrl),
              ffmpegPath,
            },
          });

          const ffmpeg = spawn(ffmpegPath, ffmpegArgs, {
            stdio: ["ignore", "pipe", "pipe"],
            shell: false,
            env: process.env,
          }) as unknown as ChildProcessWithoutNullStreams;

          hub = {
            key: sessionKey,
            protocol,
            cameraId: camera.id,
            cameraName: camera.name,
            ffmpeg,
            clients: new Set(),
            started: false,
            closed: false,
            stderr: "",
            startupTimer: null,
            idleTimer: null,
          };
          activeFfmpegPreviewSessions.set(sessionKey, hub);
          const previewHub = hub;

          previewHub.startupTimer = setTimeout(() => {
            if (previewHub.started || previewHub.closed) return;
            logger.warn("camera", `${label} preview timed out for ${camera.name}`, {
              action: `camera:${protocol}_preview_timeout`,
              details: {
                cameraId: camera.id,
                timeoutMs: FFMPEG_PREVIEW_STARTUP_TIMEOUT_MS,
                stderr: redactFfmpegPreviewDiagnostics(previewHub.stderr).trim().slice(-1200),
              },
            });
            for (const client of Array.from(previewHub.clients)) {
              if (!client.headersSent && !client.destroyed) {
                client.status(504).json({ message: `${label} preview timed out while waiting for video` });
              } else if (!client.destroyed) {
                client.end();
              }
            }
            stopPreviewHub(previewHub);
          }, FFMPEG_PREVIEW_STARTUP_TIMEOUT_MS);

          ffmpeg.stderr.on("data", (chunk) => {
            previewHub.stderr = `${previewHub.stderr}${chunk.toString()}`.slice(-4000);
          });

          ffmpeg.stdout.on("data", (chunk: Buffer) => {
            if (previewHub.closed) return;
            if (!previewHub.started) {
              previewHub.started = true;
              if (previewHub.startupTimer) {
                clearTimeout(previewHub.startupTimer);
                previewHub.startupTimer = null;
              }
              for (const client of previewHub.clients) {
                attachPreviewHeaders(client);
              }
            }
            broadcastPreviewChunk(previewHub, chunk);
          });

          ffmpeg.once("error", (error: NodeJS.ErrnoException) => {
            logger.error("camera", `${label} preview process failed to start for ${camera.name}`, {
              action: `camera:${protocol}_preview_spawn_error`,
              details: { cameraId: camera.id, ffmpegPath, ...errorDetails(error) },
            });
            const message = error.code === "ENOENT"
              ? "FFmpeg is not installed on the app host."
              : error.message || `Failed to start ${label} preview`;
            for (const client of Array.from(previewHub.clients)) {
              if (!client.headersSent && !client.destroyed) {
                client.status(error.code === "ENOENT" ? 501 : 502).json({ message });
              } else if (!client.destroyed) {
                client.end();
              }
            }
            stopPreviewHub(previewHub);
          });

          ffmpeg.once("close", (code, signal) => {
            if (previewHub.startupTimer) {
              clearTimeout(previewHub.startupTimer);
              previewHub.startupTimer = null;
            }
            activeFfmpegPreviewSessions.delete(sessionKey);
            logger[code === 0 || previewHub.started ? "info" : "warn"]("camera", `${label} preview closed for ${camera.name}`, {
              action: `camera:${protocol}_preview_closed`,
              details: {
                cameraId: camera.id,
                code,
                signal,
                started: previewHub.started,
                stderr: redactFfmpegPreviewDiagnostics(previewHub.stderr).trim().slice(-1200),
              },
            });
            for (const client of Array.from(previewHub.clients)) {
              if (!client.headersSent && !client.destroyed) {
                client.status(502).json({ message: ffmpegPreviewErrorMessage(previewHub.stderr, protocol) });
              } else if (!client.destroyed) {
                client.end();
              }
            }
            previewHub.closed = true;
            previewHub.clients.clear();
          });
        } else if (hub.idleTimer) {
          clearTimeout(hub.idleTimer);
          hub.idleTimer = null;
        }

        const activeHub = hub;
        activeHub.clients.add(res);
        if (activeHub.started) {
          attachPreviewHeaders(res);
        }

        const detachClient = () => {
          detachPreviewClient(activeHub, res);
        };

        req.on("aborted", detachClient);
        res.on("close", detachClient);
        res.on("finish", detachClient);
        req.socket.on("close", detachClient);
        req.socket.on("error", detachClient);
      } catch (error: any) {
        logger.error("camera", `${label} preview route failed`, {
          action: `camera:${protocol}_preview_error`,
          details: errorDetails(error),
        });
        if (!res.headersSent) res.status(500).json({ message: error.message || `Failed to open ${label} preview` });
      }
    });
  };

  registerFfmpegFrameRoute("/api/cameras/:id/rtsp-frame", "rtsp");
  registerFfmpegFrameRoute("/api/cameras/:id/rtp-frame", "rtp");
  registerFfmpegPreviewStreamRoute("/api/cameras/:id/rtsp-stream", "rtsp");
  registerFfmpegPreviewStreamRoute("/api/cameras/:id/rtp-stream", "rtp");

  app.post("/api/cameras/:id/webrtc/offer", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const camera = await storage.getCamera(id);
      if (!camera) return res.status(404).json({ message: "Camera not found" });
      if (!camera.streamUrl) return res.status(404).json({ message: "No WebRTC endpoint configured" });

      const parsed = webrtcOfferSchema.safeParse(req.body || {});
      if (!parsed.success) {
        return res.status(400).json({ message: fromError(parsed.error).toString() });
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch(camera.streamUrl, {
          method: "POST",
          signal: controller.signal,
          headers: {
            ...cameraAuthHeaders(camera),
            "Content-Type": "application/sdp",
            "Accept": "application/sdp",
          } as Record<string, string>,
          body: parsed.data.sdp,
        });
        clearTimeout(timeout);

        if (!response.ok) {
          return res.status(502).json({ message: `WebRTC bridge returned ${response.status}` });
        }

        res.setHeader("Content-Type", "application/sdp");
        res.send(await response.text());
      } catch (offerError: any) {
        clearTimeout(timeout);
        if (offerError.name === "AbortError") {
          return res.status(504).json({ message: "WebRTC bridge offer timed out" });
        }
        return res.status(502).json({ message: offerError.message || "Failed to reach WebRTC bridge" });
      }
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to create WebRTC offer" });
    }
  });

  app.get("/api/cameras/:id/presets", async (req, res) => {
    try {
      const cameraId = parseInt(req.params.id);
      const presets = await storage.getPresetsForCamera(cameraId);
      res.json(presets);
    } catch (error) {
      res.status(500).json({ message: "Failed to get presets" });
    }
  });

  app.post("/api/presets", async (req, res) => {
    try {
      const result = insertPresetSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: fromError(result.error).toString() });
      }

      const camera = await storage.getCamera(result.data.cameraId);
      if (!camera) {
        return res.status(404).json({ message: "Camera not found" });
      }

      const client = cameraManager.getClient(result.data.cameraId);
      if (!client || !client.isConnected()) {
        logger.warn("preset", `Preset store rejected because camera ${camera.name} is offline`, {
          action: "preset_store_offline",
          details: { cameraId: camera.id, presetNumber: result.data.presetNumber },
        });
        return res.status(409).json({ message: `Camera ${camera.name} is offline. Reconnect it, then try saving the preset again.` });
      }

      let thumbnailData = result.data.thumbnail || null;
      if (!thumbnailData) {
        try {
          if (camera?.streamUrl) {
            thumbnailData = await captureSnapshot(camera.streamUrl);
          }
        } catch (thumbnailError) {
          logger.warn("preset", `Preset thumbnail capture failed for ${camera.name}: ${thumbnailError instanceof Error ? thumbnailError.message : String(thumbnailError)}`, {
            action: "preset_thumbnail_failed",
            details: { cameraId: camera.id, presetNumber: result.data.presetNumber },
          });
        }
      }

      logger.info("preset", `Storing preset ${result.data.presetNumber + 1} on ${camera.name}`, {
        action: "preset_store_start",
        details: {
          cameraId: camera.id,
          presetNumber: result.data.presetNumber,
          hasThumbnail: Boolean(thumbnailData),
        },
      });

      await client.storePresetAsync(result.data.presetNumber);
      const preset = await storage.savePreset({ ...result.data, thumbnail: thumbnailData });

      logger.info("preset", `Stored preset ${result.data.presetNumber + 1} on ${camera.name}`, {
        action: "preset_store_success",
        details: {
          cameraId: camera.id,
          presetId: preset.id,
          presetNumber: result.data.presetNumber,
        },
      });

      addSessionLog("preset", "Store Preset", `Preset ${result.data.presetNumber + 1}${result.data.name ? ` (${result.data.name})` : ""} saved`);
      broadcast({ type: "invalidate", keys: ["presets"] });
      res.json(preset);
    } catch (error: any) {
      logger.error("preset", `Failed to save preset: ${error?.message || "Unknown error"}`, {
        action: "preset_store_error",
        details: errorDetails(error),
      });
      res.status(500).json({ message: error.message || "Failed to save preset" });
    }
  });

  app.post("/api/presets/:id/recall", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const preset = await storage.getPresetById(id);
      if (!preset) {
        return res.status(404).json({ message: "Preset not found" });
      }

      const cam = await storage.getCamera(preset.cameraId);
      if (!cam) {
        return res.status(404).json({ message: "Camera not found" });
      }

      const client = cameraManager.getClient(cam.id);
      if (!client || !client.isConnected()) {
        return res.status(404).json({ message: "Camera offline" });
      }

      const previousPreset = req.body?.previousPresetId;
      if (previousPreset) {
        pushUndo({
          type: "preset_recall",
          description: `Recall preset "${preset.name || preset.presetNumber + 1}" on ${cam.name}`,
          timestamp: Date.now(),
          undo: async () => {
            const prevP = await storage.getPresetById(previousPreset);
            if (prevP) {
              const c = cameraManager.getClient(cam.id);
              if (c && c.isConnected()) c.recallPreset(prevP.presetNumber);
            }
          },
        });
      }

      client.recallPreset(preset.presetNumber);
      addSessionLog("preset", "Recall Preset", `Preset ${preset.presetNumber + 1}${preset.name ? ` (${preset.name})` : ""} on ${cam.name}`);
      return res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to recall preset" });
    }
  });

  app.post("/api/presets/:id/thumbnail", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const preset = await refreshPresetThumbnail(storage, id, captureConfiguredPreviewThumbnail);
      logger.info("preset", "Preset thumbnail refreshed", {
        action: "preset_thumbnail_refresh",
        details: { presetId: preset.id, cameraId: preset.cameraId, presetNumber: preset.presetNumber },
      });
      broadcast({ type: "invalidate", keys: ["presets"] });
      res.json(preset);
    } catch (error: any) {
      const message = error?.message || "Failed to refresh preset thumbnail";
      const status = message === "Preset not found" || message === "Camera not found" ? 404 : 400;
      res.status(status).json({ message });
    }
  });

  app.delete("/api/presets/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deletePreset(id);
      broadcast({ type: "invalidate", keys: ["presets"] });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete preset" });
    }
  });
}
