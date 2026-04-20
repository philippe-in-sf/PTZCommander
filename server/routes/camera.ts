import type { RouteContext } from "./types";
import { insertCameraSchema, insertPresetSchema, patchCameraSchema, patchPresetSchema } from "@shared/schema";
import { errorDetails, logger } from "../logger";
import { fromError } from "zod-validation-error";
import { spawn } from "child_process";
import rateLimit from "express-rate-limit";
import net from "net";
import os from "os";
import path from "path";
import { Readable } from "stream";
import { z } from "zod";

const DEFAULT_VISCA_PORTS = [52381, 1259, 5678];
const VISCA_VERSION_INQUIRY = Buffer.from([0x81, 0x09, 0x00, 0x02, 0xff]);
const RTSP_STARTUP_TIMEOUT_MS = 8000;
const rtspPreviewRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many RTSP preview attempts; wait a minute and try again" },
});

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
  return camera.username && camera.password
    ? { Authorization: "Basic " + Buffer.from(`${camera.username}:${camera.password}`).toString("base64") }
    : {};
}

function getFfmpegPath() {
  return "ffmpeg";
}

function normalizeRtspUrl(value: string) {
  try {
    if (/[\u0000-\u001f\s]/.test(value)) return null;
    const url = new URL(value);
    if (url.protocol !== "rtsp:" && url.protocol !== "rtsps:") return null;
    if (!url.hostname) return null;
    return url.toString();
  } catch {
    return null;
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

function redactRtspDiagnostics(value: string) {
  return value.replace(/(rtsps?:\/\/)([^/\s:@]+):([^/\s@]+)@/gi, "$1redacted:redacted@");
}

function rtspErrorMessage(stderr: string) {
  const message = redactRtspDiagnostics(stderr).trim().split("\n").pop() || "";
  if (/ffmpeg: not found/i.test(message)) return "FFmpeg is not installed on the app host";
  return message || "RTSP preview ended before video was available";
}

function rtspPreviewHelperPath() {
  return path.join(process.cwd(), "server", "rtsp-preview.sh");
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

  app.get("/api/cameras", async (_req, res) => {
    try {
      const cameras = await storage.getAllCameras();
      res.json(cameras);
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

      const discovered = probes
        .filter((probe): probe is { ip: string; port: number; confidence: DiscoveryConfidence } => !!probe)
        .sort((a, b) => ipv4ToInt(a.ip) - ipv4ToInt(b.ip) || a.port - b.port)
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
      res.json({ added, skipped });
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
      res.json(camera);
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
      res.json(camera);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to create camera" });
    }
  });

  app.patch("/api/cameras/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const result = patchCameraSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: fromError(result.error).toString() });
      }
      const camera = await storage.updateCamera(id, result.data);
      if (!camera) {
        return res.status(404).json({ message: "Camera not found" });
      }
      broadcast({ type: "invalidate", keys: ["cameras"] });
      res.json(camera);
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
      if (!camera.streamUrl) return res.status(404).json({ message: "No stream URL configured" });

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      try {
        const response = await fetch(camera.streamUrl, {
          signal: controller.signal,
          headers: cameraAuthHeaders(camera),
        });
        clearTimeout(timeout);

        if (!response.ok) {
          return res.status(502).json({ message: `Camera returned ${response.status}` });
        }

        const contentType = response.headers.get('content-type') || 'image/jpeg';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

        const buffer = Buffer.from(await response.arrayBuffer());
        res.send(buffer);
      } catch (fetchError: any) {
        clearTimeout(timeout);
        if (fetchError.name === 'AbortError') {
          return res.status(504).json({ message: "Camera snapshot timed out" });
        }
        return res.status(502).json({ message: `Failed to reach camera: ${fetchError.message}` });
      }
    } catch (error: any) {
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

      req.on("close", () => controller.abort());

      const response = await fetch(camera.streamUrl, {
        signal: controller.signal,
        headers: cameraAuthHeaders(camera),
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

  app.get("/api/cameras/:id/rtsp-stream", rtspPreviewRateLimiter, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const camera = await storage.getCamera(id);
      if (!camera) return res.status(404).json({ message: "Camera not found" });
      if (!camera.streamUrl) return res.status(404).json({ message: "No RTSP URL configured" });
      const normalizedUrl = normalizeRtspUrl(camera.streamUrl);
      if (!normalizedUrl) {
        return res.status(400).json({ message: "RTSP preview URLs must start with rtsp:// or rtsps://" });
      }

      const inputUrl = normalizedUrl;
      const ffmpegPath = getFfmpegPath();
      const helperPath = rtspPreviewHelperPath();

      logger.info("camera", `Opening RTSP preview for ${camera.name}`, {
        action: "camera:rtsp_preview_start",
        details: { cameraId: camera.id, name: camera.name, url: redactPreviewUrl(camera.streamUrl), ffmpegPath, helperPath },
      });

      const ffmpeg = spawn("/bin/sh", [helperPath], {
        stdio: ["ignore", "pipe", "pipe"],
        shell: false,
        env: {
          ...process.env,
          FFMPEG_PATH: ffmpegPath,
          RTSP_URL: inputUrl,
        },
      });
      let stderr = "";
      let streamStarted = false;
      let closedByClient = false;
      let settled = false;

      const finishWithError = (status: number, message: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(startupTimer);
        if (!res.headersSent && !res.destroyed) {
          res.status(status).json({ message });
        } else if (!res.destroyed) {
          res.end();
        }
      };

      const startupTimer = setTimeout(() => {
        if (streamStarted) return;
        logger.warn("camera", `RTSP preview timed out for ${camera.name}`, {
          action: "camera:rtsp_preview_timeout",
          details: { cameraId: camera.id, timeoutMs: RTSP_STARTUP_TIMEOUT_MS, stderr: redactRtspDiagnostics(stderr).trim().slice(-1200) },
        });
        ffmpeg.kill("SIGTERM");
        finishWithError(504, "RTSP preview timed out while waiting for video");
      }, RTSP_STARTUP_TIMEOUT_MS);

      req.on("close", () => {
        closedByClient = true;
        clearTimeout(startupTimer);
        if (!ffmpeg.killed) ffmpeg.kill("SIGTERM");
      });

      ffmpeg.stderr.on("data", (chunk) => {
        stderr = `${stderr}${chunk.toString()}`.slice(-4000);
      });

      ffmpeg.stdout.on("data", (chunk) => {
        if (!streamStarted) {
          streamStarted = true;
          clearTimeout(startupTimer);
          res.setHeader("Content-Type", "multipart/x-mixed-replace; boundary=frame");
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
          res.setHeader("Connection", "close");
        }
        if (!res.destroyed) res.write(chunk);
      });

      ffmpeg.once("error", (error: NodeJS.ErrnoException) => {
        logger.error("camera", `RTSP preview helper failed to start for ${camera.name}`, {
          action: "camera:rtsp_preview_spawn_error",
          details: { cameraId: camera.id, ffmpegPath, helperPath, ...errorDetails(error) },
        });
        const message = error.code === "ENOENT"
          ? "RTSP preview helper is not available."
          : error.message || "Failed to start RTSP preview";
        finishWithError(error.code === "ENOENT" ? 501 : 502, message);
      });

      ffmpeg.once("close", (code, signal) => {
        clearTimeout(startupTimer);
        if (!closedByClient) {
          logger[code === 0 || streamStarted ? "info" : "warn"]("camera", `RTSP preview closed for ${camera.name}`, {
            action: "camera:rtsp_preview_closed",
            details: { cameraId: camera.id, code, signal, started: streamStarted, stderr: redactRtspDiagnostics(stderr).trim().slice(-1200) },
          });
        }
        if (!res.headersSent && !res.destroyed) {
          res.status(502).json({ message: rtspErrorMessage(stderr) });
        } else if (!res.destroyed) {
          res.end();
        }
      });
    } catch (error: any) {
      logger.error("camera", "RTSP preview route failed", {
        action: "camera:rtsp_preview_error",
        details: errorDetails(error),
      });
      if (!res.headersSent) res.status(500).json({ message: error.message || "Failed to open RTSP preview" });
    }
  });

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
          },
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

      let thumbnailData = result.data.thumbnail || null;
      if (!thumbnailData) {
        try {
          const camera = await storage.getCamera(result.data.cameraId);
          if (camera?.streamUrl) {
            thumbnailData = await captureSnapshot(camera.streamUrl);
          }
        } catch {}
      }

      const preset = await storage.savePreset({ ...result.data, thumbnail: thumbnailData });

      const client = cameraManager.getClient(result.data.cameraId);
      if (client && client.isConnected()) {
        client.storePreset(result.data.presetNumber);
      }

      addSessionLog("preset", "Store Preset", `Preset ${result.data.presetNumber + 1}${result.data.name ? ` (${result.data.name})` : ""} saved`);
      broadcast({ type: "invalidate", keys: ["presets"] });
      res.json(preset);
    } catch (error: any) {
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
