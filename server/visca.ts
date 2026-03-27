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

  // Pan/Tilt velocity control for joystick
  // pan: -1.0 (left) to 1.0 (right)
  // tilt: -1.0 (down) to 1.0 (up)
  panTilt(pan: number, tilt: number, speed: number = 0.5): void {
    // VISCA PanTilt Drive command: 8x 01 06 01 VV WW XX YY FF
    // VV = pan speed (01-18 hex, 0x18 = 24 max)
    // WW = tilt speed (01-14 hex, 0x14 = 20 max)
    // XX = pan direction: 01 = left, 02 = right, 03 = stop
    // YY = tilt direction: 01 = up, 02 = down, 03 = stop
    
    // Calculate speeds based on joystick magnitude
    const panSpeed = Math.max(1, Math.min(24, Math.floor(Math.abs(pan) * 24 * speed)));
    const tiltSpeed = Math.max(1, Math.min(20, Math.floor(Math.abs(tilt) * 20 * speed)));
    
    // Determine direction bytes
    let panDirection: number;
    if (Math.abs(pan) < 0.05) {
      panDirection = 0x03; // Stop
    } else if (pan < 0) {
      panDirection = 0x01; // Left
    } else {
      panDirection = 0x02; // Right
    }
    
    let tiltDirection: number;
    if (Math.abs(tilt) < 0.05) {
      tiltDirection = 0x03; // Stop
    } else if (tilt > 0) {
      tiltDirection = 0x01; // Up
    } else {
      tiltDirection = 0x02; // Down
    }
    
    const cmd = Buffer.from([
      0x81, 0x01, 0x06, 0x01,
      panSpeed,
      tiltSpeed,
      panDirection,
      tiltDirection,
      0xFF
    ]);

    console.log(`[VISCA] Sending pan/tilt to ${this.host}:${this.port}: speed=${panSpeed}/${tiltSpeed}, dir=${panDirection}/${tiltDirection}`);
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

  focusFar(speed: number = 0.5): void {
    const s = Math.max(0, Math.min(1, speed));
    const spd = Math.round(s * 7);
    const cmd = Buffer.from([0x81, 0x01, 0x04, 0x08, 0x20 | spd, 0xFF]);
    this.sendCommand(cmd);
  }

  focusNear(speed: number = 0.5): void {
    const s = Math.max(0, Math.min(1, speed));
    const spd = Math.round(s * 7);
    const cmd = Buffer.from([0x81, 0x01, 0x04, 0x08, 0x30 | spd, 0xFF]);
    this.sendCommand(cmd);
  }

  focusStop(): void {
    const cmd = Buffer.from([0x81, 0x01, 0x04, 0x08, 0x00, 0xFF]);
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

  // Tally light control
  // state: "program" (red), "preview" (green), "off"
  tallyOn(): void {
    const cmd = Buffer.from([0x81, 0x01, 0x7E, 0x01, 0x0A, 0x00, 0x02, 0xFF]);
    console.log(`[VISCA] Tally ON for ${this.host}:${this.port}`);
    this.sendCommand(cmd);
  }

  tallyOff(): void {
    const cmd = Buffer.from([0x81, 0x01, 0x7E, 0x01, 0x0A, 0x00, 0x03, 0xFF]);
    console.log(`[VISCA] Tally OFF for ${this.host}:${this.port}`);
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

  getConnectedCameraIds(): number[] {
    return Array.from(this.connections.keys());
  }

  disconnectAll(): void {
    Array.from(this.connections.entries()).forEach(([id, client]) => {
      client.disconnect();
    });
    this.connections.clear();
  }
}

export const cameraManager = new CameraConnectionManager();
