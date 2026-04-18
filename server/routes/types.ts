import type { Express } from "express";
import type { IStorage } from "../storage";
import type { cameraManager } from "../visca";
import type { x32Manager } from "../x32";
import type { atemManager } from "../atem";
import type { obsManager } from "../obs";

export interface UndoAction {
  type: string;
  description: string;
  timestamp: number;
  undo: () => Promise<void>;
}

export interface SessionLogEntry {
  id: number;
  timestamp: number;
  action: string;
  details: string;
  category: "camera" | "preset" | "scene" | "switcher" | "mixer" | "macro" | "layout" | "system";
}

export interface RouteContext {
  app: Express;
  storage: IStorage;
  cameraManager: typeof cameraManager;
  x32Manager: typeof x32Manager;
  atemManager: typeof atemManager;
  obsManager: typeof obsManager;
  broadcast: (msg: Record<string, unknown>) => void;
  pushUndo: (action: UndoAction) => void;
  addSessionLog: (category: SessionLogEntry["category"], action: string, details: string) => void;
  captureSnapshot: (url: string) => Promise<string | null>;
  undoStack: UndoAction[];
  sessionLog: SessionLogEntry[];
}
