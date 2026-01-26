import { useEffect, useRef, useCallback } from "react";

export class PTZWebSocket {
  private ws: WebSocket | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private reconnectDelay = 2000;

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

  send(data: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.warn("[WebSocket] Cannot send, not connected");
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

  recallPreset(cameraId: number, presetNumber: number): void {
    this.send({
      type: "recall_preset",
      cameraId,
      presetNumber,
    });
  }
}

// Hook for using WebSocket in components
export function useWebSocket(url: string): PTZWebSocket | null {
  const wsRef = useRef<PTZWebSocket | null>(null);

  useEffect(() => {
    if (!wsRef.current) {
      wsRef.current = new PTZWebSocket(url);
      wsRef.current.connect();
    }

    return () => {
      wsRef.current?.disconnect();
      wsRef.current = null;
    };
  }, [url]);

  return wsRef.current;
}
