import type { Camera, InsertCamera, Preset, InsertPreset, Mixer, InsertMixer, Switcher, InsertSwitcher, SceneButton, InsertSceneButton, Layout, InsertLayout, Macro, InsertMacro } from "@shared/schema";

const API_BASE = "/api";

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
};
