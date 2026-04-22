import { useEffect, useRef, useCallback } from "react";
import type { InsertPreset, Preset } from "@shared/schema";

export type MixerChannelState = {
  channel: number;
  fader: number;
  muted: boolean;
  name: string;
};

export type WsMessageInbound =
  | { type: "version"; version: string }
  | { type: "invalidate"; keys: string[] }
  | { type: "atem_state"; [key: string]: unknown }
  | { type: "mixer_state"; section?: string; channels: MixerChannelState[] }
  | { type: "mixer_section_state"; section: string; channels: MixerChannelState[] }
  | { type: "preset_store_result"; requestId: string; ok: boolean; preset?: Preset; message?: string }
  | { type: string; [key: string]: unknown };

export type WebSocketMessageHandler = (message: WsMessageInbound) => void;
export type WebSocketConnectionHandler = (connected: boolean) => void;

export class PTZWebSocket {
  private ws: WebSocket | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private reconnectAttempts = 0;
  private maxReconnectDelay = 30000;
  private messageHandlers: Set<WebSocketMessageHandler> = new Set();
  private connectionHandlers: Set<WebSocketConnectionHandler> = new Set();
  private pendingPresetStores = new Map<string, {
    resolve: (preset: Preset) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }>();

  constructor(private url: string) {}

  connect(onOpen?: () => void, onClose?: () => void): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.reconnectDelay = 1000;
      this.connectionHandlers.forEach((handler) => handler(true));
      onOpen?.();
    };

    this.ws.onclose = () => {
      this.connectionHandlers.forEach((handler) => handler(false));
      onClose?.();

      this.pendingPresetStores.forEach((pending) => {
        clearTimeout(pending.timeout);
        pending.reject(new Error("Control WebSocket disconnected"));
      });
      this.pendingPresetStores.clear();
      
      this.reconnectAttempts++;
      const jitter = Math.random() * 500;
      const delay = Math.min(this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1), this.maxReconnectDelay) + jitter;
      this.reconnectTimeout = setTimeout(() => {
        this.connect(onOpen, onClose);
      }, delay);
    };

    this.ws.onerror = () => {};

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as WsMessageInbound;
        if (message.type === "preset_store_result" && typeof message.requestId === "string") {
          const pending = this.pendingPresetStores.get(message.requestId);
          if (pending) {
            clearTimeout(pending.timeout);
            this.pendingPresetStores.delete(message.requestId);
            if (message.ok && message.preset) {
              pending.resolve(message.preset);
            } else {
              pending.reject(new Error(message.message || "Failed to save preset"));
            }
          }
        }
        this.messageHandlers.forEach(handler => handler(message));
      } catch {
      }
    };
  }

  addMessageHandler(handler: WebSocketMessageHandler): void {
    this.messageHandlers.add(handler);
  }

  removeMessageHandler(handler: WebSocketMessageHandler): void {
    this.messageHandlers.delete(handler);
  }

  addConnectionHandler(handler: WebSocketConnectionHandler): void {
    this.connectionHandlers.add(handler);
  }

  removeConnectionHandler(handler: WebSocketConnectionHandler): void {
    this.connectionHandlers.delete(handler);
  }

  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.pendingPresetStores.forEach((pending) => {
      clearTimeout(pending.timeout);
      pending.reject(new Error("WebSocket disconnected"));
    });
    this.pendingPresetStores.clear();
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  send(data: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  panTilt(cameraId: number, pan: number, tilt: number, speed: number = 0.5): void {
    this.send({
      type: "pan_tilt",
      cameraId,
      pan,
      tilt,
      speed,
    });
  }

  panTiltStop(cameraId: number): void {
    this.send({
      type: "pan_tilt_stop",
      cameraId,
    });
  }

  zoom(cameraId: number, zoom: number, speed: number = 0.5): void {
    this.send({
      type: "zoom",
      cameraId,
      zoom,
      speed,
    });
  }

  focusAuto(cameraId: number): void {
    this.send({
      type: "focus_auto",
      cameraId,
    });
  }

  focusFar(cameraId: number, speed: number = 0.5): void {
    this.send({ type: "focus_far", cameraId, speed });
  }

  focusNear(cameraId: number, speed: number = 0.5): void {
    this.send({ type: "focus_near", cameraId, speed });
  }

  focusStop(cameraId: number): void {
    this.send({ type: "focus_stop", cameraId });
  }

  recallPreset(cameraId: number, presetNumber: number): void {
    this.send({
      type: "recall_preset",
      cameraId,
      presetNumber,
    });
  }

  storePreset(preset: InsertPreset): Promise<Preset> {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("Control WebSocket is not connected"));
    }

    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    return new Promise<Preset>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingPresetStores.delete(requestId);
        reject(new Error("Preset save timed out"));
      }, 10000);

      this.pendingPresetStores.set(requestId, { resolve, reject, timeout });
      this.send({
        type: "store_preset",
        requestId,
        preset,
      });
    });
  }
}

export function buildWebSocketUrl(path: string = "/ws"): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${path}`;
}

let globalWsInstance: PTZWebSocket | null = null;

function getWebSocketInstance(): PTZWebSocket {
  if (!globalWsInstance) {
    const url = buildWebSocketUrl("/ws");
    globalWsInstance = new PTZWebSocket(url);
    globalWsInstance.connect();
  }
  return globalWsInstance;
}

export function useWebSocket(): PTZWebSocket {
  const wsRef = useRef<PTZWebSocket>(getWebSocketInstance());
  return wsRef.current;
}

export function useWsMessage(handler: WebSocketMessageHandler): void {
  const savedHandler = useRef(handler);
  savedHandler.current = handler;

  const ws = useWebSocket();

  useEffect(() => {
    const stableHandler: WebSocketMessageHandler = (msg) => savedHandler.current(msg);
    ws.addMessageHandler(stableHandler);
    return () => {
      ws.removeMessageHandler(stableHandler);
    };
  }, [ws]);
}
