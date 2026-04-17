import dgram from "dgram";
import { request as httpRequest } from "http";
import { request as httpsRequest } from "https";
import WebSocket from "ws";

const SSDP_ADDR = "239.255.255.250";
const SSDP_PORT = 1900;
const APP_NAME = Buffer.from("PTZCommander").toString("base64");

export interface SamsungDiscoveryResult {
  ip: string;
  port: number;
  name: string;
  modelName?: string;
  location?: string;
}

function parseHeaders(message: string) {
  const headers = new Map<string, string>();
  for (const line of message.split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx > 0) headers.set(line.slice(0, idx).trim().toLowerCase(), line.slice(idx + 1).trim());
  }
  return headers;
}

function xmlValue(xml: string, tag: string) {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, "i"));
  return match ? match[1].trim() : undefined;
}

async function fetchText(url: string, timeoutMs = 1200) {
  return new Promise<string>((resolve, reject) => {
    const mod = url.startsWith("https:") ? httpsRequest : httpRequest;
    const req = mod(url, { timeout: timeoutMs, rejectUnauthorized: false } as any, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timed out"));
    });
    req.on("error", reject);
    req.end();
  });
}

async function getDeviceInfo(location: string, ip: string): Promise<Partial<SamsungDiscoveryResult>> {
  try {
    const xml = await fetchText(location);
    return {
      name: xmlValue(xml, "friendlyName"),
      modelName: xmlValue(xml, "modelName") || xmlValue(xml, "modelDescription"),
      location,
      ip,
    };
  } catch {
    return { ip, location };
  }
}

async function probeSamsungApi(ip: string) {
  for (const port of [8001, 8002]) {
    const protocol = port === 8002 ? "https" : "http";
    try {
      const body = await fetchText(`${protocol}://${ip}:${port}/api/v2/`);
      const parsed = JSON.parse(body);
      return {
        ip,
        port,
        name: parsed?.device?.name || parsed?.device?.modelName || `Samsung TV ${ip}`,
        modelName: parsed?.device?.modelName,
      };
    } catch {
      // Try the next port.
    }
  }
  return null;
}

export async function discoverSamsungDisplays(timeoutMs = 3500): Promise<SamsungDiscoveryResult[]> {
  const socket = dgram.createSocket("udp4");
  const found = new Map<string, SamsungDiscoveryResult>();
  const searches = [
    "ssdp:all",
    "upnp:rootdevice",
    "urn:samsung.com:device:RemoteControlReceiver:1",
  ];

  await new Promise<void>((resolve) => socket.bind(() => resolve()));

  socket.on("message", async (msg, remote) => {
    const text = msg.toString("utf8");
    if (!/samsung|RemoteControlReceiver|smarttv|tv/i.test(text)) return;
    const headers = parseHeaders(text);
    const location = headers.get("location");
    const basic = await probeSamsungApi(remote.address);
    const fromXml = location ? await getDeviceInfo(location, remote.address) : {};
    const result: SamsungDiscoveryResult = {
      ip: remote.address,
      port: basic?.port || 8002,
      name: fromXml.name || basic?.name || `Samsung TV ${remote.address}`,
      modelName: fromXml.modelName || basic?.modelName,
      location,
    };
    found.set(remote.address, result);
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
  return Array.from(found.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export class SamsungLocalDisplayClient {
  constructor(private readonly options: { ip: string; port?: number; token?: string | null }) {}

  private endpoint(token?: string | null) {
    const port = this.options.port || 8002;
    const protocol = port === 8002 ? "wss" : "ws";
    const url = new URL(`${protocol}://${this.options.ip}:${port}/api/v2/channels/samsung.remote.control`);
    url.searchParams.set("name", APP_NAME);
    if (token) url.searchParams.set("token", token);
    return url.toString();
  }

  private connect(token?: string | null, timeoutMs = 30000) {
    return new Promise<{ ws: WebSocket; token?: string }>((resolve, reject) => {
      const ws = new WebSocket(this.endpoint(token), { rejectUnauthorized: false });
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error("Timed out waiting for Samsung TV pairing"));
      }, timeoutMs);

      ws.on("message", (data) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.event === "ms.channel.connect") {
            clearTimeout(timer);
            resolve({ ws, token: message?.data?.token || token || undefined });
          }
        } catch {
          // Ignore non-JSON frames.
        }
      });
      ws.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  async pair() {
    const { ws, token } = await this.connect(null, 45000);
    ws.close();
    if (!token) throw new Error("TV did not return a pairing token. Accept the prompt on the TV and try again.");
    return token;
  }

  async sendKey(key: string) {
    const { ws } = await this.connect(this.options.token, 10000);
    ws.send(JSON.stringify({
      method: "ms.remote.control",
      params: {
        Cmd: "Click",
        DataOfCmd: key,
        Option: "false",
        TypeOfRemote: "SendRemoteKey",
      },
    }));
    await new Promise((resolve) => setTimeout(resolve, 150));
    ws.close();
  }

  async getInfo() {
    const info = await probeSamsungApi(this.options.ip);
    if (!info) throw new Error("Samsung TV did not respond on the local network");
    return info;
  }
}

export function keyForSamsungAction(action: { command: string; value?: string | number | boolean }) {
  switch (action.command) {
    case "power_on":
    case "power_off":
    case "power_toggle":
      return "KEY_POWER";
    case "mute":
    case "unmute":
      return "KEY_MUTE";
    case "volume_up":
      return "KEY_VOLUP";
    case "volume_down":
      return "KEY_VOLDOWN";
    case "set_input": {
      const input = String(action.value || "").toUpperCase().replace(/\s+/g, "");
      if (/^HDMI[1-4]$/.test(input)) return `KEY_${input}`;
      return input.startsWith("KEY_") ? input : undefined;
    }
    default:
      return undefined;
  }
}
