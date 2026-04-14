import http from "http";
import https from "https";
import { logger } from "./logger";

export interface HueLight {
  id: string;
  name: string;
  on: boolean;
  brightness: number;
  colorTemp?: number;
  hue?: number;
  sat?: number;
  reachable: boolean;
  type: string;
}

export interface HueGroup {
  id: string;
  name: string;
  type: string;
  lights: string[];
  on: boolean;
  brightness: number;
}

export interface HueScene {
  id: string;
  name: string;
  group?: string;
  lights: string[];
}

function hueRequest(
  method: string,
  ip: string,
  path: string,
  body?: any,
  redirectCount = 0
): Promise<any> {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : undefined;
    const baseUrl = ip.startsWith("http://") || ip.startsWith("https://") ? ip : `http://${ip}`;
    const requestUrl = new URL(path, baseUrl);
    const transport = requestUrl.protocol === "https:" ? https : http;
    const options: https.RequestOptions = {
      hostname: requestUrl.hostname,
      port: requestUrl.port || (requestUrl.protocol === "https:" ? 443 : 80),
      path: `${requestUrl.pathname}${requestUrl.search}`,
      method,
      timeout: 5000,
      rejectUnauthorized: false,
      headers: {
        "Content-Type": "application/json",
        ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
      },
    };
    const req = transport.request(options, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (redirectCount >= 3) {
          reject(new Error("Too many Hue bridge redirects"));
          return;
        }

        res.resume();
        hueRequest(method, new URL(res.headers.location, requestUrl).toString(), "", body, redirectCount + 1)
          .then(resolve)
          .catch(reject);
        return;
      }

      let raw = "";
      res.on("data", (chunk) => (raw += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(raw));
        } catch {
          resolve(raw);
        }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
    if (data) req.write(data);
    req.end();
  });
}

function hueErrorMessage(response: unknown): string | null {
  if (!Array.isArray(response)) return null;
  const messages = response
    .map((entry) => entry?.error?.description)
    .filter((description): description is string => typeof description === "string");
  return messages.length > 0 ? messages.join("; ") : null;
}

function assertHueSuccess<T>(response: T): T {
  const message = hueErrorMessage(response);
  if (message) throw new Error(message);
  return response;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class HueClient {
  constructor(private ip: string, private apiKey: string) {}

  private apiPath(sub: string) {
    return `/api/${this.apiKey}${sub}`;
  }

  async getLights(): Promise<HueLight[]> {
    const raw = assertHueSuccess(await hueRequest("GET", this.ip, this.apiPath("/lights")));
    return Object.entries(raw).map(([id, data]: [string, any]) => ({
      id,
      name: data.name,
      on: data.state.on,
      brightness: data.state.bri ?? 0,
      colorTemp: data.state.ct,
      hue: data.state.hue,
      sat: data.state.sat,
      reachable: data.state.reachable,
      type: data.type,
    }));
  }

  async getGroups(): Promise<HueGroup[]> {
    const raw = assertHueSuccess(await hueRequest("GET", this.ip, this.apiPath("/groups")));
    return Object.entries(raw).map(([id, data]: [string, any]) => ({
      id,
      name: data.name,
      type: data.type,
      lights: data.lights ?? [],
      on: data.action?.on ?? false,
      brightness: data.action?.bri ?? 0,
    }));
  }

  async getScenes(): Promise<HueScene[]> {
    const raw = assertHueSuccess(await hueRequest("GET", this.ip, this.apiPath("/scenes")));
    return Object.entries(raw).map(([id, data]: [string, any]) => ({
      id,
      name: data.name,
      group: data.group,
      lights: data.lights ?? [],
    }));
  }

  async setLightState(lightId: string, state: {
    on?: boolean;
    bri?: number;
    ct?: number;
    hue?: number;
    sat?: number;
  }) {
    return assertHueSuccess(await hueRequest("PUT", this.ip, this.apiPath(`/lights/${lightId}/state`), state));
  }

  async setGroupState(groupId: string, state: {
    on?: boolean;
    bri?: number;
    ct?: number;
    scene?: string;
  }) {
    return assertHueSuccess(await hueRequest("PUT", this.ip, this.apiPath(`/groups/${groupId}/action`), state));
  }

  async activateScene(sceneId: string, groupId?: string) {
    if (groupId) {
      return this.setGroupState(groupId, { scene: sceneId });
    }
    return assertHueSuccess(await hueRequest("PUT", this.ip, this.apiPath(`/groups/0/action`), { scene: sceneId }));
  }

  async ping(): Promise<boolean> {
    try {
      const res = await hueRequest("GET", this.ip, this.apiPath("/lights"));
      return typeof res === "object" && !Array.isArray(res);
    } catch {
      return false;
    }
  }
}

// Bridge discovery & pairing
export async function discoverBridge(ip: string): Promise<boolean> {
  try {
    const res = await hueRequest("GET", ip, "/api/0/config");
    return typeof res === "object" && res.bridgeid !== undefined;
  } catch {
    return false;
  }
}

export async function pairBridge(ip: string): Promise<string | null> {
  try {
    const res = await hueRequest("POST", ip, "/api", { devicetype: "ptzcommand#replit" });
    if (Array.isArray(res) && res[0]?.success?.username) {
      return res[0].success.username;
    }
    return null;
  } catch {
    return null;
  }
}

export async function pairBridgeWithDetails(ip: string): Promise<{ apiKey: string | null; error?: string }> {
  const deadline = Date.now() + 30000;
  let lastError: string | undefined;

  try {
    do {
      const res = await hueRequest("POST", ip, "/api", { devicetype: "ptzcommand#replit" });
      if (Array.isArray(res) && res[0]?.success?.username) {
        return { apiKey: res[0].success.username };
      }

      lastError = hueErrorMessage(res) ?? "Unexpected response from Hue bridge";
      if (!lastError.toLowerCase().includes("link button not pressed")) {
        return { apiKey: null, error: lastError };
      }

      await wait(1000);
    } while (Date.now() < deadline);

    return { apiKey: null, error: lastError ?? "Timed out waiting for Hue bridge link button" };
  } catch (error: unknown) {
    return { apiKey: null, error: error instanceof Error ? error.message : "Failed to contact Hue bridge" };
  }
}

// In-memory client cache
const clients = new Map<number, HueClient>();

export function getHueClient(bridgeId: number): HueClient | undefined {
  return clients.get(bridgeId);
}

export function setHueClient(bridgeId: number, ip: string, apiKey: string) {
  clients.set(bridgeId, new HueClient(ip, apiKey));
}

export function removeHueClient(bridgeId: number) {
  clients.delete(bridgeId);
}
