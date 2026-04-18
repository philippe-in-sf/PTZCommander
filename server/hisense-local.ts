import dgram from "dgram";
import net from "net";
import mqtt, { type IClientOptions, type MqttClient } from "mqtt";

const SSDP_ADDR = "239.255.255.250";
const SSDP_PORT = 1900;
const DEFAULT_PORT = 36669;
const DEFAULT_USERNAME = "hisenseservice";
const DEFAULT_PASSWORD = "multimqttservice";
const DEFAULT_CLIENT_NAME = "PTZCommander";

export interface HisenseDiscoveryResult {
  ip: string;
  port: number;
  name: string;
  modelName?: string;
  useSsl: boolean;
  location?: string;
}

interface HisenseClientOptions {
  ip: string;
  port?: number | null;
  useSsl?: boolean | null;
  username?: string | null;
  password?: string | null;
  clientName?: string | null;
  timeoutMs?: number;
}

function parseHeaders(message: string) {
  const headers = new Map<string, string>();
  for (const line of message.split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx > 0) headers.set(line.slice(0, idx).trim().toLowerCase(), line.slice(idx + 1).trim());
  }
  return headers;
}

function normalizeClientName(value?: string | null) {
  return (value || DEFAULT_CLIENT_NAME).replace(/[^\w:.-]/g, "").slice(0, 48) || DEFAULT_CLIENT_NAME;
}

function topic(clientName: string, service: "platform_service" | "remote_service" | "ui_service", action: string) {
  return `/remoteapp/tv/${service}/${clientName}/actions/${action}`;
}

function tryPort(host: string, port: number, timeoutMs = 900) {
  return new Promise<boolean>((resolve) => {
    const socket = net.createConnection({ host, port });
    const finish = (open: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(timeoutMs);
    socket.on("connect", () => finish(true));
    socket.on("timeout", () => finish(false));
    socket.on("error", () => finish(false));
  });
}

async function detectMqttMode(ip: string, port: number): Promise<{ reachable: boolean; useSsl: boolean }> {
  for (const useSsl of [true, false]) {
    try {
      const client = await connectMqtt({ ip, port, useSsl, timeoutMs: 1200 });
      client.end(true);
      return { reachable: true, useSsl };
    } catch {
      // Try the next transport.
    }
  }
  return { reachable: await tryPort(ip, port), useSsl: true };
}

export async function discoverHisenseDisplays(timeoutMs = 3500): Promise<HisenseDiscoveryResult[]> {
  const socket = dgram.createSocket("udp4");
  const found = new Map<string, HisenseDiscoveryResult>();
  const candidates = new Map<string, { name?: string; modelName?: string; location?: string }>();
  const searches = [
    "ssdp:all",
    "upnp:rootdevice",
    "urn:schemas-upnp-org:device:MediaRenderer:1",
  ];

  await new Promise<void>((resolve) => socket.bind(() => resolve()));

  socket.on("message", (msg, remote) => {
    const text = msg.toString("utf8");
    const headers = parseHeaders(text);
    const descriptor = `${text} ${headers.get("server") || ""} ${headers.get("usn") || ""}`;
    if (!/hisense|vidaa|canvas|mediarenderer|dial/i.test(descriptor)) return;
    const name = headers.get("fn") || headers.get("friendlyname");
    candidates.set(remote.address, {
      name,
      modelName: headers.get("modelname") || headers.get("model"),
      location: headers.get("location"),
    });
  });

  const packet = (st: string) => Buffer.from([
    "M-SEARCH * HTTP/1.1",
    `HOST: ${SSDP_ADDR}:${SSDP_PORT}`,
    'MAN: "ssdp:discover"',
    "MX: 2",
    `ST: ${st}`,
    "",
    "",
  ].join("\r\n"));

  for (const search of searches) {
    socket.send(packet(search), SSDP_PORT, SSDP_ADDR);
  }

  await new Promise((resolve) => setTimeout(resolve, timeoutMs));
  socket.close();

  await Promise.all(Array.from(candidates.entries()).map(async ([ip, details]) => {
    const mode = await detectMqttMode(ip, DEFAULT_PORT);
    if (!mode.reachable) return;
    found.set(ip, {
      ip,
      port: DEFAULT_PORT,
      name: details.name || `Hisense Canvas ${ip}`,
      modelName: details.modelName,
      useSsl: mode.useSsl,
      location: details.location,
    });
  }));

  return Array.from(found.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function connectMqtt(options: HisenseClientOptions) {
  const port = options.port || DEFAULT_PORT;
  const useSsl = options.useSsl !== false;
  const protocol = useSsl ? "mqtts" : "mqtt";
  const clientName = normalizeClientName(options.clientName);
  const mqttOptions: IClientOptions = {
    username: options.username || DEFAULT_USERNAME,
    password: options.password || DEFAULT_PASSWORD,
    clientId: `${clientName}-${Math.random().toString(16).slice(2)}`,
    connectTimeout: options.timeoutMs || 5000,
    reconnectPeriod: 0,
    rejectUnauthorized: false,
  };

  return new Promise<MqttClient>((resolve, reject) => {
    const client = mqtt.connect(`${protocol}://${options.ip}:${port}`, mqttOptions);
    const timer = setTimeout(() => {
      client.end(true);
      reject(new Error("Timed out connecting to Hisense TV"));
    }, options.timeoutMs || 5000);

    client.once("connect", () => {
      clearTimeout(timer);
      resolve(client);
    });
    client.once("error", (error) => {
      clearTimeout(timer);
      client.end(true);
      reject(error);
    });
  });
}

export class HisenseVidaaClient {
  private readonly options: {
    ip: string;
    port: number;
    useSsl: boolean;
    username: string;
    password: string;
    clientName: string;
    timeoutMs: number;
  };

  constructor(options: HisenseClientOptions) {
    this.options = {
      ip: options.ip,
      port: options.port || DEFAULT_PORT,
      useSsl: options.useSsl !== false,
      username: options.username || DEFAULT_USERNAME,
      password: options.password || DEFAULT_PASSWORD,
      clientName: normalizeClientName(options.clientName),
      timeoutMs: options.timeoutMs || 6000,
    };
  }

  private async withClient<T>(fn: (client: MqttClient) => Promise<T>) {
    const client = await connectMqtt(this.options);
    try {
      return await fn(client);
    } finally {
      client.end(true);
    }
  }

  private publish(client: MqttClient, service: "platform_service" | "remote_service" | "ui_service", action: string, payload: string | object = "") {
    const body = typeof payload === "string" ? payload : JSON.stringify(payload);
    client.publish(topic(this.options.clientName, service, action), body);
  }

  private waitForJson(client: MqttClient, action: () => void, timeoutMs = this.options.timeoutMs) {
    return new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("Timed out waiting for Hisense TV response"));
      }, timeoutMs);
      const cleanup = () => {
        clearTimeout(timer);
        client.off("message", onMessage);
      };
      const onMessage = (_topic: string, payload: Buffer) => {
        if (!payload.length) return;
        try {
          cleanup();
          resolve(JSON.parse(payload.toString("utf8")));
        } catch {
          // Keep waiting for a JSON response.
        }
      };
      client.on("message", onMessage);
      client.subscribe([
        `/remoteapp/mobile/${this.options.clientName}/#`,
        "/remoteapp/mobile/broadcast/#",
      ], (error) => {
        if (error) {
          cleanup();
          reject(error);
          return;
        }
        action();
      });
    });
  }

  async getInfo() {
    const volume = await this.getVolume().catch(() => undefined);
    return { port: this.options.port, useSsl: this.options.useSsl, volume };
  }

  async pair(authCode?: string) {
    return this.withClient(async (client) => {
      if (!authCode?.trim()) {
        await this.waitForJson(client, () => this.publish(client, "ui_service", "gettvstate", "0")).catch(() => null);
        return;
      }
      const response = await this.waitForJson(client, () => this.publish(client, "ui_service", "authenticationcode", { authNum: authCode.trim() }));
      if (response?.result !== undefined && Number(response.result) !== 1) {
        throw new Error(`Hisense TV rejected the authorization code (${response.result})`);
      }
    });
  }

  async sendKey(key: string) {
    await this.withClient(async (client) => {
      this.publish(client, "remote_service", "sendkey", key);
    });
  }

  async getVolume() {
    return this.withClient(async (client) => {
      const response = await this.waitForJson(client, () => this.publish(client, "platform_service", "getvolume"));
      const raw = response?.volume_value ?? response?.volume ?? response;
      const volume = typeof raw === "number" ? raw : parseInt(String(raw), 10);
      return Number.isFinite(volume) ? volume : undefined;
    });
  }

  async setVolume(volume: number) {
    const nextVolume = Math.max(0, Math.min(100, Math.round(volume)));
    await this.withClient(async (client) => {
      this.publish(client, "platform_service", "changevolume", String(nextVolume));
    });
  }

  async setSource(value: string | number) {
    const sourceid = sourceIdForInput(value);
    if (!sourceid) throw new Error(`Hisense local control does not recognize input ${value}`);
    await this.withClient(async (client) => {
      this.publish(client, "ui_service", "changesource", { sourceid });
    });
  }
}

export function keyForHisenseAction(action: { command: string; value?: string | number | boolean }) {
  switch (action.command) {
    case "power_on":
    case "power_off":
    case "power_toggle":
      return "KEY_POWER";
    case "mute":
    case "unmute":
      return "KEY_MUTE";
    case "volume_up":
      return "KEY_VOLUMEUP";
    case "volume_down":
      return "KEY_VOLUMEDOWN";
    default:
      return undefined;
  }
}

function sourceIdForInput(value: string | number) {
  if (typeof value === "number") return String(value);
  const input = String(value || "").toUpperCase().replace(/\s+/g, "");
  const hdmi = input.match(/^HDMI([1-4])$/);
  if (hdmi) return String(Number(hdmi[1]) + 2);
  if (/^\d+$/.test(input)) return input;
  if (input === "TV") return "0";
  if (input === "AV") return "1";
  if (input === "COMPONENT") return "2";
  return undefined;
}
