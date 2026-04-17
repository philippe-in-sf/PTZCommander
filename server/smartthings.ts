const SMARTTHINGS_BASE_URL = "https://api.smartthings.com/v1";
const SMARTTHINGS_AUTH_URL = "https://api.smartthings.com/oauth/authorize";
const SMARTTHINGS_TOKEN_URL = "https://api.smartthings.com/oauth/token";

export interface SmartThingsDeviceSummary {
  deviceId: string;
  name: string;
  label?: string;
  manufacturerName?: string;
  presentationId?: string;
  capabilities: string[];
}

export interface SmartThingsCommand {
  component?: string;
  capability: string;
  command: string;
  arguments?: unknown[];
}

export interface SmartThingsTokenBundle {
  accessToken: string;
  refreshToken?: string;
  expiresAt: string;
  scope?: string;
}

function encodeBasicAuth(clientId: string, clientSecret: string) {
  return Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
}

function normalizeTokenResponse(data: any): SmartThingsTokenBundle {
  const expiresIn = typeof data.expires_in === "number" ? data.expires_in : 86400;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + Math.max(60, expiresIn - 60) * 1000).toISOString(),
    scope: data.scope,
  };
}

function getAttribute(status: any, capability: string, attribute: string) {
  return status?.components?.main?.[capability]?.[attribute]?.value;
}

export class SmartThingsClient {
  constructor(private readonly token: string) {}

  static getAuthorizeUrl(options: { clientId: string; redirectUri: string; scope: string; state: string }) {
    const url = new URL(SMARTTHINGS_AUTH_URL);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", options.clientId);
    url.searchParams.set("redirect_uri", options.redirectUri);
    url.searchParams.set("scope", options.scope);
    url.searchParams.set("state", options.state);
    return url.toString();
  }

  static async exchangeCode(options: { clientId: string; clientSecret: string; redirectUri: string; code: string }) {
    const response = await fetch(SMARTTHINGS_TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${encodeBasicAuth(options.clientId, options.clientSecret)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: options.code,
        redirect_uri: options.redirectUri,
      }),
    });
    if (!response.ok) throw new Error(await response.text().catch(() => `SmartThings OAuth returned ${response.status}`));
    return normalizeTokenResponse(await response.json());
  }

  static async refreshAccessToken(options: { clientId: string; clientSecret: string; refreshToken: string }) {
    const response = await fetch(SMARTTHINGS_TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${encodeBasicAuth(options.clientId, options.clientSecret)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: options.refreshToken,
      }),
    });
    if (!response.ok) throw new Error(await response.text().catch(() => `SmartThings token refresh returned ${response.status}`));
    return normalizeTokenResponse(await response.json());
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${SMARTTHINGS_BASE_URL}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(body || `SmartThings returned ${response.status}`);
    }

    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  async listDevices(): Promise<SmartThingsDeviceSummary[]> {
    const data = await this.request<{ items: any[] }>("/devices");
    return (data.items || []).map((device) => ({
      deviceId: device.deviceId,
      name: device.name,
      label: device.label,
      manufacturerName: device.manufacturerName,
      presentationId: device.presentationId,
      capabilities: (device.components || [])
        .flatMap((component: any) => component.capabilities || [])
        .map((capability: any) => capability.id)
        .filter(Boolean),
    }));
  }

  async getStatus(deviceId: string) {
    const status = await this.request<any>(`/devices/${deviceId}/status`);
    return {
      powerState: getAttribute(status, "switch", "switch") ?? null,
      volume: getAttribute(status, "audioVolume", "volume") ?? null,
      muted: getAttribute(status, "audioMute", "mute") === "muted",
      inputSource: getAttribute(status, "mediaInputSource", "inputSource") ?? null,
      raw: status,
    };
  }

  async sendCommands(deviceId: string, commands: SmartThingsCommand[]) {
    return this.request(`/devices/${deviceId}/commands`, {
      method: "POST",
      body: JSON.stringify({
        commands: commands.map((command) => ({
          component: command.component || "main",
          capability: command.capability,
          command: command.command,
          arguments: command.arguments || [],
        })),
      }),
    });
  }
}

export function commandForDisplayAction(action: {
  command: string;
  value?: string | number | boolean;
  capability?: string;
  smartthingsCommand?: string;
  arguments?: unknown[];
}): SmartThingsCommand {
  switch (action.command) {
    case "power_on":
      return { capability: "switch", command: "on" };
    case "power_off":
      return { capability: "switch", command: "off" };
    case "set_volume":
      return { capability: "audioVolume", command: "setVolume", arguments: [Number(action.value)] };
    case "volume_up":
      return { capability: "audioVolume", command: "volumeUp" };
    case "volume_down":
      return { capability: "audioVolume", command: "volumeDown" };
    case "mute":
      return { capability: "audioMute", command: "mute" };
    case "unmute":
      return { capability: "audioMute", command: "unmute" };
    case "set_input":
      return { capability: "mediaInputSource", command: "setInputSource", arguments: [String(action.value)] };
    case "custom":
      if (!action.capability || !action.smartthingsCommand) {
        throw new Error("Custom SmartThings commands require capability and command");
      }
      return {
        capability: action.capability,
        command: action.smartthingsCommand,
        arguments: action.arguments || (action.value !== undefined ? [action.value] : []),
      };
    default:
      throw new Error(`Unsupported display command: ${action.command}`);
  }
}
