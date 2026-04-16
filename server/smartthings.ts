const SMARTTHINGS_BASE_URL = "https://api.smartthings.com/v1";

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

function getAttribute(status: any, capability: string, attribute: string) {
  return status?.components?.main?.[capability]?.[attribute]?.value;
}

export class SmartThingsClient {
  constructor(private readonly token: string) {}

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
