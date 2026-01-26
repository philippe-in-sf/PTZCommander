import type { Camera, InsertCamera, Preset, InsertPreset } from "@shared/schema";

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
