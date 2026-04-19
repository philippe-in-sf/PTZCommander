import type { Camera, InsertCamera, Preset, InsertPreset, Mixer, InsertMixer, Switcher, InsertSwitcher, SceneButton, InsertSceneButton, Layout, InsertLayout, Macro, InsertMacro, ObsConnection, InsertObsConnection, RunsheetCue, InsertRunsheetCue, DisplayDevice, InsertDisplayDevice } from "@shared/schema";

const API_BASE = "/api";

export interface DiscoveredCamera {
  ip: string;
  port: number;
  protocol: "visca";
  confidence: "confirmed" | "port-open";
  name: string;
  alreadyConfigured: boolean;
}

export interface CameraDiscoveryResult {
  subnets: string[];
  ports: number[];
  timeoutMs: number;
  cameras: DiscoveredCamera[];
}

export interface CameraDiscoveryOptions {
  subnet?: string;
  subnets?: string[];
  ports?: number[];
  timeoutMs?: number;
}

export type RunsheetCueWithScene = RunsheetCue & {
  scene: SceneButton | null;
};

export interface SmartThingsDiscoveredDevice {
  deviceId: string;
  name: string;
  label?: string;
  manufacturerName?: string;
  capabilities: string[];
}

export interface SamsungDiscoveredDisplay {
  ip: string;
  port: number;
  protocol: "samsung_local";
  name: string;
  modelName?: string;
  location?: string;
  alreadyConfigured: boolean;
}

export interface HisenseDiscoveredDisplay {
  ip: string;
  port: number;
  protocol: "hisense_vidaa";
  name: string;
  modelName?: string;
  useSsl: boolean;
  location?: string;
  alreadyConfigured: boolean;
}

export interface DisplayCommandPayload {
  command: "power_on" | "power_off" | "power_toggle" | "set_volume" | "volume_up" | "volume_down" | "mute" | "unmute" | "set_input" | "custom";
  value?: string | number | boolean;
  capability?: string;
  smartthingsCommand?: string;
  arguments?: unknown[];
}

export interface SmartThingsOAuthSession {
  accessToken: string;
  refreshToken?: string;
  expiresAt: string;
  scope?: string;
  clientId: string;
  clientSecret: string;
}

export interface ObsScene {
  sceneName: string;
  sceneIndex?: number;
}

export interface ObsState {
  connected: boolean;
  host?: string;
  port?: number;
  currentProgramScene?: string | null;
  currentPreviewScene?: string | null;
  studioMode?: boolean;
  scenes?: ObsScene[];
  error?: string;
}

export interface RehearsalMode {
  enabled: boolean;
}

export const rehearsalApi = {
  get: async (): Promise<RehearsalMode> => {
    const res = await fetch(`${API_BASE}/rehearsal`);
    if (!res.ok) throw new Error("Failed to fetch rehearsal mode");
    return res.json();
  },

  set: async (enabled: boolean): Promise<RehearsalMode> => {
    const res = await fetch(`${API_BASE}/rehearsal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    if (!res.ok) throw new Error("Failed to update rehearsal mode");
    return res.json();
  },
};

// Camera API
export const cameraApi = {
  getAll: async (): Promise<Camera[]> => {
    const res = await fetch(`${API_BASE}/cameras`);
    if (!res.ok) throw new Error("Failed to fetch cameras");
    return res.json();
  },

  getOne: async (id: number): Promise<Camera> => {
    const res = await fetch(`${API_BASE}/cameras/${id}`);
    if (!res.ok) throw new Error("Failed to fetch camera");
    return res.json();
  },

  create: async (camera: InsertCamera): Promise<Camera> => {
    const res = await fetch(`${API_BASE}/cameras`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(camera),
    });
    if (!res.ok) throw new Error("Failed to create camera");
    return res.json();
  },

  update: async (id: number, updates: Partial<Camera>): Promise<Camera> => {
    const res = await fetch(`${API_BASE}/cameras/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error("Failed to update camera");
    return res.json();
  },

  delete: async (id: number): Promise<void> => {
    const res = await fetch(`${API_BASE}/cameras/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to delete camera");
  },

  setProgram: async (id: number): Promise<void> => {
    const res = await fetch(`${API_BASE}/cameras/${id}/program`, {
      method: "POST",
    });
    if (!res.ok) throw new Error("Failed to set program camera");
  },

  setPreview: async (id: number): Promise<void> => {
    const res = await fetch(`${API_BASE}/cameras/${id}/preview`, {
      method: "POST",
    });
    if (!res.ok) throw new Error("Failed to set preview camera");
  },

  getPresets: async (id: number): Promise<Preset[]> => {
    const res = await fetch(`${API_BASE}/cameras/${id}/presets`);
    if (!res.ok) throw new Error("Failed to fetch presets");
    return res.json();
  },

  discover: async (options: CameraDiscoveryOptions = {}): Promise<CameraDiscoveryResult> => {
    const res = await fetch(`${API_BASE}/cameras/discover`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(options),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      throw new Error(payload?.message || "Failed to discover cameras");
    }
    return res.json();
  },

  importDiscovered: async (cameras: Array<{ ip: string; port: number; name?: string; streamUrl?: string | null }>): Promise<{ added: Camera[]; skipped: Array<{ ip: string; port: number; reason: string }> }> => {
    const res = await fetch(`${API_BASE}/cameras/import-discovered`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cameras }),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      throw new Error(payload?.message || "Failed to add discovered cameras");
    }
    return res.json();
  },
};

// Preset API
export const presetApi = {
  save: async (preset: InsertPreset): Promise<Preset> => {
    const res = await fetch(`${API_BASE}/presets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(preset),
    });
    if (!res.ok) throw new Error("Failed to save preset");
    return res.json();
  },

  recall: async (id: number): Promise<void> => {
    const res = await fetch(`${API_BASE}/presets/${id}/recall`, {
      method: "POST",
    });
    if (!res.ok) throw new Error("Failed to recall preset");
  },

  delete: async (id: number): Promise<void> => {
    const res = await fetch(`${API_BASE}/presets/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to delete preset");
  },
};

// Mixer API
export const mixerApi = {
  getAll: async (): Promise<Mixer[]> => {
    const res = await fetch(`${API_BASE}/mixers`);
    if (!res.ok) throw new Error("Failed to fetch mixers");
    return res.json();
  },

  getOne: async (id: number): Promise<Mixer> => {
    const res = await fetch(`${API_BASE}/mixers/${id}`);
    if (!res.ok) throw new Error("Failed to fetch mixer");
    return res.json();
  },

  create: async (mixer: InsertMixer): Promise<Mixer> => {
    const res = await fetch(`${API_BASE}/mixers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mixer),
    });
    if (!res.ok) throw new Error("Failed to create mixer");
    return res.json();
  },

  update: async (id: number, updates: Partial<Mixer>): Promise<Mixer> => {
    const res = await fetch(`${API_BASE}/mixers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error("Failed to update mixer");
    return res.json();
  },

  delete: async (id: number): Promise<void> => {
    const res = await fetch(`${API_BASE}/mixers/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to delete mixer");
  },

  connect: async (id: number): Promise<{ success: boolean; status: string }> => {
    const res = await fetch(`${API_BASE}/mixers/${id}/connect`, {
      method: "POST",
    });
    if (!res.ok) throw new Error("Failed to connect to mixer");
    return res.json();
  },

  getStatus: async (id: number): Promise<{ connected: boolean; channels: any[]; sections?: Record<string, any[]> }> => {
    const res = await fetch(`${API_BASE}/mixers/${id}/status`);
    if (!res.ok) throw new Error("Failed to get mixer status");
    return res.json();
  },
};

// Switcher (ATEM) API
export const switcherApi = {
  getAll: async (): Promise<Switcher[]> => {
    const res = await fetch(`${API_BASE}/switchers`);
    if (!res.ok) throw new Error("Failed to fetch switchers");
    return res.json();
  },

  getOne: async (id: number): Promise<Switcher> => {
    const res = await fetch(`${API_BASE}/switchers/${id}`);
    if (!res.ok) throw new Error("Failed to fetch switcher");
    return res.json();
  },

  create: async (switcher: InsertSwitcher): Promise<Switcher> => {
    const res = await fetch(`${API_BASE}/switchers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(switcher),
    });
    if (!res.ok) throw new Error("Failed to create switcher");
    return res.json();
  },

  update: async (id: number, updates: Partial<Switcher>): Promise<Switcher> => {
    const res = await fetch(`${API_BASE}/switchers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error("Failed to update switcher");
    return res.json();
  },

  delete: async (id: number): Promise<void> => {
    const res = await fetch(`${API_BASE}/switchers/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to delete switcher");
  },

  connect: async (id: number): Promise<{ success: boolean; status: string }> => {
    const res = await fetch(`${API_BASE}/switchers/${id}/connect`, {
      method: "POST",
    });
    if (!res.ok) throw new Error("Failed to connect to switcher");
    return res.json();
  },

  getStatus: async (id: number): Promise<any> => {
    const res = await fetch(`${API_BASE}/switchers/${id}/status`);
    if (!res.ok) throw new Error("Failed to get switcher status");
    return res.json();
  },

  cut: async (id: number): Promise<void> => {
    const res = await fetch(`${API_BASE}/switchers/${id}/cut`, {
      method: "POST",
    });
    if (!res.ok) throw new Error("Failed to execute cut");
  },

  auto: async (id: number): Promise<void> => {
    const res = await fetch(`${API_BASE}/switchers/${id}/auto`, {
      method: "POST",
    });
    if (!res.ok) throw new Error("Failed to execute auto transition");
  },

  setProgram: async (id: number, inputId: number): Promise<void> => {
    const res = await fetch(`${API_BASE}/switchers/${id}/program`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inputId }),
    });
    if (!res.ok) throw new Error("Failed to set program input");
  },

  setPreview: async (id: number, inputId: number): Promise<void> => {
    const res = await fetch(`${API_BASE}/switchers/${id}/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inputId }),
    });
    if (!res.ok) throw new Error("Failed to set preview input");
  },
};

export const obsApi = {
  getAll: async (): Promise<ObsConnection[]> => {
    const res = await fetch(`${API_BASE}/obs`);
    if (!res.ok) throw new Error("Failed to fetch OBS connections");
    return res.json();
  },

  create: async (connection: InsertObsConnection): Promise<ObsConnection> => {
    const res = await fetch(`${API_BASE}/obs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(connection),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      throw new Error(payload?.message || "Failed to create OBS connection");
    }
    return res.json();
  },

  update: async (id: number, updates: Partial<ObsConnection>): Promise<ObsConnection> => {
    const res = await fetch(`${API_BASE}/obs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      throw new Error(payload?.message || "Failed to update OBS connection");
    }
    return res.json();
  },

  delete: async (id: number): Promise<void> => {
    const res = await fetch(`${API_BASE}/obs/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete OBS connection");
  },

  connect: async (id: number): Promise<{ success: boolean; status: string; state?: ObsState }> => {
    const res = await fetch(`${API_BASE}/obs/${id}/connect`, { method: "POST" });
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      throw new Error(payload?.message || "Failed to connect to OBS");
    }
    return res.json();
  },

  disconnect: async (id: number): Promise<{ success: boolean; status: string }> => {
    const res = await fetch(`${API_BASE}/obs/${id}/disconnect`, { method: "POST" });
    if (!res.ok) throw new Error("Failed to disconnect OBS");
    return res.json();
  },

  getStatus: async (id: number): Promise<ObsState> => {
    const res = await fetch(`${API_BASE}/obs/${id}/status`);
    if (!res.ok) throw new Error("Failed to get OBS status");
    return res.json();
  },

  getScenes: async (id: number): Promise<{ scenes: ObsScene[]; state: ObsState }> => {
    const res = await fetch(`${API_BASE}/obs/${id}/scenes`);
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      throw new Error(payload?.message || "Failed to fetch OBS scenes");
    }
    return res.json();
  },

  setProgramScene: async (id: number, sceneName: string): Promise<{ success: boolean; state: ObsState }> => {
    const res = await fetch(`${API_BASE}/obs/${id}/program`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sceneName }),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      throw new Error(payload?.message || "Failed to switch OBS scene");
    }
    return res.json();
  },
};

export const sceneButtonApi = {
  getAll: async (): Promise<SceneButton[]> => {
    const res = await fetch(`${API_BASE}/scene-buttons`);
    if (!res.ok) throw new Error("Failed to fetch scene buttons");
    return res.json();
  },

  create: async (button: InsertSceneButton): Promise<SceneButton> => {
    const res = await fetch(`${API_BASE}/scene-buttons`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(button),
    });
    if (!res.ok) throw new Error("Failed to create scene button");
    return res.json();
  },

  update: async (id: number, updates: Partial<SceneButton>): Promise<SceneButton> => {
    const res = await fetch(`${API_BASE}/scene-buttons/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error("Failed to update scene button");
    return res.json();
  },

  delete: async (id: number): Promise<void> => {
    const res = await fetch(`${API_BASE}/scene-buttons/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to delete scene button");
  },

  execute: async (id: number): Promise<{ success: boolean; results: string[] }> => {
    const res = await fetch(`${API_BASE}/scene-buttons/${id}/execute`, {
      method: "POST",
    });
    if (!res.ok) throw new Error("Failed to execute scene button");
    return res.json();
  },

  test: async (id: number, section: "atem" | "obs" | "mixer" | "hue" | "ptz" | "display"): Promise<{ success: boolean; results: string[] }> => {
    const res = await fetch(`${API_BASE}/scene-buttons/${id}/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section }),
    });
    if (!res.ok) throw new Error("Failed to test scene button");
    return res.json();
  },
};

export const displayApi = {
  getAll: async (): Promise<DisplayDevice[]> => {
    const res = await fetch(`${API_BASE}/displays`);
    if (!res.ok) throw new Error("Failed to fetch displays");
    return res.json();
  },

  discoverSamsung: async (timeoutMs = 3500): Promise<{ displays: SamsungDiscoveredDisplay[] }> => {
    const res = await fetch(`${API_BASE}/displays/samsung/discover`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timeoutMs }),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      throw new Error(payload?.message || "Failed to discover Samsung TVs");
    }
    return res.json();
  },

  discoverHisense: async (timeoutMs = 3500): Promise<{ displays: HisenseDiscoveredDisplay[] }> => {
    const res = await fetch(`${API_BASE}/displays/hisense/discover`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timeoutMs }),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      throw new Error(payload?.message || "Failed to discover Hisense Canvas TVs");
    }
    return res.json();
  },

  discoverSmartThings: async (token: string): Promise<{ devices: SmartThingsDiscoveredDevice[] }> => {
    const res = await fetch(`${API_BASE}/displays/smartthings/discover`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      throw new Error(payload?.message || "Failed to discover SmartThings displays");
    }
    return res.json();
  },

  startSmartThingsOAuth: async (payload: { clientId: string; clientSecret: string; redirectUri: string; scope: string }): Promise<{ authorizeUrl: string; state: string; redirectUri: string; scope: string }> => {
    const res = await fetch(`${API_BASE}/displays/smartthings/oauth/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.message || "Failed to start SmartThings authorization");
    }
    return res.json();
  },

  getSmartThingsOAuthSession: async (state: string): Promise<SmartThingsOAuthSession> => {
    const res = await fetch(`${API_BASE}/displays/smartthings/oauth/session/${encodeURIComponent(state)}`);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.message || "Failed to complete SmartThings authorization");
    }
    return res.json();
  },

  create: async (display: InsertDisplayDevice): Promise<DisplayDevice> => {
    const res = await fetch(`${API_BASE}/displays`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(display),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      throw new Error(payload?.message || "Failed to create display");
    }
    return res.json();
  },

  update: async (id: number, updates: Partial<DisplayDevice>): Promise<DisplayDevice> => {
    const res = await fetch(`${API_BASE}/displays/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error("Failed to update display");
    return res.json();
  },

  delete: async (id: number): Promise<void> => {
    const res = await fetch(`${API_BASE}/displays/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete display");
  },

  refresh: async (id: number): Promise<DisplayDevice> => {
    const res = await fetch(`${API_BASE}/displays/${id}/refresh`, { method: "POST" });
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      throw new Error(payload?.message || "Failed to refresh display");
    }
    return res.json();
  },

  pair: async (id: number, payload?: { authCode?: string }): Promise<DisplayDevice> => {
    const res = await fetch(`${API_BASE}/displays/${id}/pair`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      throw new Error(payload?.message || "Failed to pair Samsung TV");
    }
    return res.json();
  },

  command: async (id: number, payload: DisplayCommandPayload): Promise<DisplayDevice> => {
    const res = await fetch(`${API_BASE}/displays/${id}/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.message || "Failed to control display");
    }
    return res.json();
  },
};

export const macroApi = {
  getAll: async (): Promise<Macro[]> => {
    const res = await fetch(`${API_BASE}/macros`);
    if (!res.ok) throw new Error("Failed to fetch macros");
    return res.json();
  },

  getOne: async (id: number): Promise<Macro> => {
    const res = await fetch(`${API_BASE}/macros/${id}`);
    if (!res.ok) throw new Error("Failed to fetch macro");
    return res.json();
  },

  create: async (macro: InsertMacro): Promise<Macro> => {
    const res = await fetch(`${API_BASE}/macros`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(macro),
    });
    if (!res.ok) throw new Error("Failed to create macro");
    return res.json();
  },

  update: async (id: number, updates: Partial<Macro>): Promise<Macro> => {
    const res = await fetch(`${API_BASE}/macros/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error("Failed to update macro");
    return res.json();
  },

  delete: async (id: number): Promise<void> => {
    const res = await fetch(`${API_BASE}/macros/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to delete macro");
  },

  execute: async (id: number): Promise<{ success: boolean; message: string }> => {
    const res = await fetch(`${API_BASE}/macros/${id}/execute`, {
      method: "POST",
    });
    if (!res.ok) throw new Error("Failed to execute macro");
    return res.json();
  },
};

export const runsheetApi = {
  getAll: async (): Promise<RunsheetCueWithScene[]> => {
    const res = await fetch(`${API_BASE}/runsheet/cues`);
    if (!res.ok) throw new Error("Failed to fetch runsheet cues");
    return res.json();
  },

  create: async (cue: InsertRunsheetCue): Promise<RunsheetCueWithScene> => {
    const res = await fetch(`${API_BASE}/runsheet/cues`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cue),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      throw new Error(payload?.message || "Failed to add runsheet cue");
    }
    return res.json();
  },

  update: async (id: number, updates: Partial<RunsheetCue>): Promise<RunsheetCueWithScene> => {
    const res = await fetch(`${API_BASE}/runsheet/cues/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      throw new Error(payload?.message || "Failed to update runsheet cue");
    }
    return res.json();
  },

  delete: async (id: number): Promise<void> => {
    const res = await fetch(`${API_BASE}/runsheet/cues/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete runsheet cue");
  },

  reorder: async (ids: number[]): Promise<RunsheetCueWithScene[]> => {
    const res = await fetch(`${API_BASE}/runsheet/cues/reorder`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      throw new Error(payload?.message || "Failed to reorder runsheet cues");
    }
    return res.json();
  },
};

export const undoApi = {
  getStatus: async (): Promise<{ canUndo: boolean; count: number; lastAction: any }> => {
    const res = await fetch(`${API_BASE}/undo/status`);
    if (!res.ok) throw new Error("Failed to get undo status");
    return res.json();
  },
  undo: async (): Promise<{ success: boolean; message: string }> => {
    const res = await fetch(`${API_BASE}/undo`, { method: "POST" });
    if (!res.ok) throw new Error("Failed to undo");
    return res.json();
  },
};

export const sessionLogApi = {
  getAll: async (): Promise<any[]> => {
    const res = await fetch(`${API_BASE}/session-log`);
    if (!res.ok) throw new Error("Failed to get session log");
    return res.json();
  },
  clear: async (): Promise<void> => {
    await fetch(`${API_BASE}/session-log`, { method: "DELETE" });
  },
};

export const healthApi = {
  getDevices: async (): Promise<any> => {
    const res = await fetch(`${API_BASE}/health/devices`);
    if (!res.ok) throw new Error("Failed to get device health");
    return res.json();
  },
};

export const layoutApi = {
  getAll: async (): Promise<Layout[]> => {
    const res = await fetch(`${API_BASE}/layouts`);
    if (!res.ok) throw new Error("Failed to fetch layouts");
    return res.json();
  },

  getActive: async (): Promise<Layout | null> => {
    const res = await fetch(`${API_BASE}/layouts/active`);
    if (!res.ok) throw new Error("Failed to fetch active layout");
    return res.json();
  },

  getOne: async (id: number): Promise<Layout> => {
    const res = await fetch(`${API_BASE}/layouts/${id}`);
    if (!res.ok) throw new Error("Failed to fetch layout");
    return res.json();
  },

  saveCurrent: async (data: { name: string; description?: string; color?: string }): Promise<Layout> => {
    const res = await fetch(`${API_BASE}/layouts/save-current`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Failed to save layout");
    return res.json();
  },

  load: async (id: number): Promise<{ success: boolean; message: string }> => {
    const res = await fetch(`${API_BASE}/layouts/${id}/load`, {
      method: "POST",
    });
    if (!res.ok) throw new Error("Failed to load layout");
    return res.json();
  },

  updateSnapshot: async (id: number): Promise<Layout> => {
    const res = await fetch(`${API_BASE}/layouts/${id}/update-snapshot`, {
      method: "POST",
    });
    if (!res.ok) throw new Error("Failed to update layout snapshot");
    return res.json();
  },

  update: async (id: number, updates: Partial<Layout>): Promise<Layout> => {
    const res = await fetch(`${API_BASE}/layouts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error("Failed to update layout");
    return res.json();
  },

  delete: async (id: number): Promise<void> => {
    const res = await fetch(`${API_BASE}/layouts/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to delete layout");
  },

  exportLayout: async (id: number): Promise<void> => {
    const res = await fetch(`${API_BASE}/layouts/${id}/export`);
    if (!res.ok) throw new Error("Failed to export layout");
    const data = await res.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `layout-${data.layout.name.replace(/[^a-z0-9]/gi, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  importLayout: async (file: File): Promise<Layout> => {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const res = await fetch(`${API_BASE}/layouts/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed),
    });
    if (!res.ok) throw new Error("Failed to import layout");
    return res.json();
  },
};
