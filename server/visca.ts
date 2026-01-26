import net from "net";

export interface VISCACommand {
  pan: number;
  tilt: number;
  zoom?: number;
  focus?: number;
}

export class VISCAClient {
  private host: string;
  private port: number;
  private socket: net.Socket | null = null;
  private connected: boolean = false;

  constructor(host: string, port: number = 52381) {
    this.host = host;
    this.port = port;
  }

  async connect(): Promise<boolean> {
    return new Promise((resolve) => {
      this.socket = new net.Socket();
      
      this.socket.on("connect", () => {
        this.connected = true;
        console.log(`[VISCA] Connected to ${this.host}:${this.port}`);
        resolve(true);
      });

      this.socket.on("error", (err) => {
        console.error(`[VISCA] Connection error to ${this.host}:${this.port}:`, err.message);
        this.connected = false;
        resolve(false);
      });

      this.socket.on("close", () => {
        this.connected = false;
        console.log(`[VISCA] Disconnected from ${this.host}:${this.port}`);
      });

      this.socket.connect(this.port, this.host);
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
      this.connected = false;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  // Send raw VISCA command
  private sendCommand(command: Buffer): void {
    if (!this.socket || !this.connected) {
      console.warn("[VISCA] Not connected, cannot send command");
      return;
    }
    this.socket.write(command);
  }

  // Pan/Tilt control with speed
  // pan: -1.0 (left) to 1.0 (right)
  // tilt: -1.0 (down) to 1.0 (up)
  panTilt(pan: number, tilt: number, speed: number = 0.5): void {
    // VISCA Pan/Tilt command format:
    // 8x 01 06 01 VV WW 0Y 0Y 0Y 0Y 0Z 0Z 0Z 0Z FF
    // VV = pan speed (01-18 hex)
    // WW = tilt speed (01-14 hex)
    // YYYY = pan position
    // ZZZZ = tilt position
    
    const panSpeed = Math.floor(Math.abs(pan) * 24 * speed);
    const tiltSpeed = Math.floor(Math.abs(tilt) * 20 * speed);
    
    // Map normalized values to VISCA position range
    // VISCA pan range is typically -880 to +880 (0xFC90 to 0x0370)
    // VISCA tilt range is typically -300 to +300 (0xFED4 to 0x012C)
    const panPos = Math.floor(pan * 880);
    const tiltPos = Math.floor(tilt * 300);
    
    // Clamp to valid ranges
    const clampedPanSpeed = Math.max(1, Math.min(24, panSpeed));
    const clampedTiltSpeed = Math.max(1, Math.min(20, tiltSpeed));
    
    const cmd = Buffer.from([
      0x81, 0x01, 0x06, 0x02,
      clampedPanSpeed,
      clampedTiltSpeed,
      (panPos >> 12) & 0x0F,
      (panPos >> 8) & 0x0F,
      (panPos >> 4) & 0x0F,
      panPos & 0x0F,
      (tiltPos >> 12) & 0x0F,
      (tiltPos >> 8) & 0x0F,
      (tiltPos >> 4) & 0x0F,
      tiltPos & 0x0F,
      0xFF
    ]);

    this.sendCommand(cmd);
  }

  // Stop pan/tilt movement
  panTiltStop(): void {
    const cmd = Buffer.from([
      0x81, 0x01, 0x06, 0x01,
      0x00, 0x00, 0x03, 0x03, // Speed and stop
      0xFF
    ]);
    this.sendCommand(cmd);
  }

  // Zoom control
  // zoom: -1.0 (wide) to 1.0 (tele)
  zoom(zoom: number, speed: number = 0.5): void {
    if (zoom === 0) {
      this.zoomStop();
      return;
    }

    const zoomSpeed = Math.floor(Math.abs(zoom) * 7 * speed);
    const clampedSpeed = Math.max(2, Math.min(7, zoomSpeed));
    
    const direction = zoom > 0 ? 0x20 : 0x30; // Tele or Wide
    
    const cmd = Buffer.from([
      0x81, 0x01, 0x04, 0x07,
      direction | clampedSpeed,
      0xFF
    ]);
    
    this.sendCommand(cmd);
  }

  zoomStop(): void {
    const cmd = Buffer.from([0x81, 0x01, 0x04, 0x07, 0x00, 0xFF]);
    this.sendCommand(cmd);
  }

  // Focus control
  focusAuto(): void {
    const cmd = Buffer.from([0x81, 0x01, 0x04, 0x38, 0x02, 0xFF]);
    this.sendCommand(cmd);
  }

  focusManual(): void {
    const cmd = Buffer.from([0x81, 0x01, 0x04, 0x38, 0x03, 0xFF]);
    this.sendCommand(cmd);
  }

  // Recall preset
  recallPreset(presetNumber: number): void {
    if (presetNumber < 0 || presetNumber > 254) {
      console.warn("[VISCA] Invalid preset number:", presetNumber);
      return;
    }

    const cmd = Buffer.from([
      0x81, 0x01, 0x04, 0x3F, 0x02,
      presetNumber,
      0xFF
    ]);
    
    this.sendCommand(cmd);
  }

  // Store current position as preset
  storePreset(presetNumber: number): void {
    if (presetNumber < 0 || presetNumber > 254) {
      console.warn("[VISCA] Invalid preset number:", presetNumber);
      return;
    }

    const cmd = Buffer.from([
      0x81, 0x01, 0x04, 0x3F, 0x01,
      presetNumber,
      0xFF
    ]);
    
    this.sendCommand(cmd);
  }

  // Home position
  home(): void {
    const cmd = Buffer.from([0x81, 0x01, 0x06, 0x04, 0xFF]);
    this.sendCommand(cmd);
  }
}

// Camera connection manager
export class CameraConnectionManager {
  private connections: Map<number, VISCAClient> = new Map();

  async connectCamera(id: number, ip: string, port: number = 52381): Promise<boolean> {
    const client = new VISCAClient(ip, port);
    const connected = await client.connect();
    
    if (connected) {
      this.connections.set(id, client);
    }
    
    return connected;
  }

  disconnectCamera(id: number): void {
    const client = this.connections.get(id);
    if (client) {
      client.disconnect();
      this.connections.delete(id);
    }
  }

  getClient(id: number): VISCAClient | undefined {
    return this.connections.get(id);
  }

  disconnectAll(): void {
    Array.from(this.connections.entries()).forEach(([id, client]) => {
      client.disconnect();
    });
    this.connections.clear();
  }
}

export const cameraManager = new CameraConnectionManager();
