import { useEffect, useRef, useCallback } from "react";

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
  | { type: string; [key: string]: unknown };

export type WebSocketMessageHandler = (message: WsMessageInbound) => void;

export class PTZWebSocket {
  private ws: WebSocket | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private reconnectAttempts = 0;
  private maxReconnectDelay = 30000;
  private messageHandlers: Set<WebSocketMessageHandler> = new Set();

  constructor(private url: string) {}

  connect(onOpen?: () => void, onClose?: () => void): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.reconnectDelay = 1000;
      onOpen?.();
    };

    this.ws.onclose = () => {
      onClose?.();
      
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

  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
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
