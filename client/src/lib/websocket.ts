import { useEffect, useRef, useState } from "react";

export type MixerChannelState = {
  channel: number;
  fader: number;
  muted: boolean;
  name: string;
};

export type WebSocketMessageHandler = (message: any) => void;

export class PTZWebSocket {
  private ws: WebSocket | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private reconnectDelay = 2000;
  private messageHandlers: Set<WebSocketMessageHandler> = new Set();

  constructor(private url: string) {}

  connect(onOpen?: () => void, onClose?: () => void): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      console.log("[WebSocket] Connected");
      onOpen?.();
    };

    this.ws.onclose = () => {
      console.log("[WebSocket] Disconnected");
      onClose?.();
      
      // Auto-reconnect after delay
      this.reconnectTimeout = setTimeout(() => {
        this.connect(onOpen, onClose);
      }, this.reconnectDelay);
    };

    this.ws.onerror = (error) => {
      console.error("[WebSocket] Error:", error);
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        this.messageHandlers.forEach(handler => handler(message));
      } catch (error) {
        console.error("[WebSocket] Error parsing message:", error);
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

  send(data: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.warn("[WebSocket] Cannot send, not connected");
    }
  }

  panTilt(cameraId: number, pan: number, tilt: number, speed: number = 0.5): void {
    console.log(`[PTZ] Sending pan_tilt: camera=${cameraId}, pan=${pan.toFixed(2)}, tilt=${tilt.toFixed(2)}`);
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

  recallPreset(cameraId: number, presetNumber: number): void {
    this.send({
      type: "recall_preset",
      cameraId,
      presetNumber,
    });
  }
}

// Build WebSocket URL based on current protocol (ws:// or wss://)
export function buildWebSocketUrl(path: string = "/ws"): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${path}`;
}

// Singleton WebSocket instance
let globalWsInstance: PTZWebSocket | null = null;

function getWebSocketInstance(): PTZWebSocket {
  if (!globalWsInstance) {
    const url = buildWebSocketUrl("/ws");
    globalWsInstance = new PTZWebSocket(url);
    globalWsInstance.connect();
  }
  return globalWsInstance;
}

// Hook for using WebSocket in components
export function useWebSocket(): PTZWebSocket {
  const [, forceUpdate] = useState(0);
  
  // Get or create the singleton instance immediately
  const ws = getWebSocketInstance();

  useEffect(() => {
    // Add a handler to force re-render on connection state changes
    const handler = () => forceUpdate(n => n + 1);
    ws.addMessageHandler(handler);
    
    return () => {
      ws.removeMessageHandler(handler);
    };
  }, [ws]);

  return ws;
}
