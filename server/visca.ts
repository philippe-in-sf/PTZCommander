import net from "net";
import { logger } from "./logger";

const CONNECTION_TIMEOUT_MS = 5000;

const VISCA_HEADER = 0x81;
const VISCA_TERMINATOR = 0xFF;

const PAN_TILT_CMD = [0x01, 0x06, 0x01];
const ZOOM_CMD = [0x01, 0x04, 0x07];
const FOCUS_CMD = [0x01, 0x04, 0x08];
const FOCUS_AUTO_CMD = [0x01, 0x04, 0x38, 0x02];
const FOCUS_MANUAL_CMD = [0x01, 0x04, 0x38, 0x03];
const PRESET_RECALL_CMD = [0x01, 0x04, 0x3F, 0x02];
const PRESET_STORE_CMD = [0x01, 0x04, 0x3F, 0x01];
const TALLY_ON_CMD = [0x01, 0x7E, 0x01, 0x0A, 0x00, 0x02];
const TALLY_OFF_CMD = [0x01, 0x7E, 0x01, 0x0A, 0x00, 0x03];
const HOME_CMD = [0x01, 0x06, 0x04];

const PAN_MAX_SPEED = 24;
const TILT_MAX_SPEED = 20;
const ZOOM_MAX_SPEED = 7;
const ZOOM_MIN_SPEED = 2;
const FOCUS_MAX_SPEED = 7;

const DIR_LEFT = 0x01;
const DIR_RIGHT = 0x02;
const DIR_STOP = 0x03;
const DIR_UP = 0x01;
const DIR_DOWN = 0x02;

const ZOOM_TELE = 0x20;
const ZOOM_WIDE = 0x30;
const FOCUS_FAR = 0x20;
const FOCUS_NEAR = 0x30;

const DEADZONE = 0.05;

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

      const timeout = setTimeout(() => {
        logger.warn("camera", `VISCA connection timeout to ${this.host}:${this.port}`, { action: "visca_timeout", details: { host: this.host, port: this.port } });
        this.socket?.destroy();
        this.connected = false;
        resolve(false);
      }, CONNECTION_TIMEOUT_MS);

      this.socket.on("connect", () => {
        clearTimeout(timeout);
        this.connected = true;
        logger.info("camera", `VISCA connected to ${this.host}:${this.port}`, { action: "visca_connected", details: { host: this.host, port: this.port } });
        resolve(true);
      });

      this.socket.on("error", (err) => {
        clearTimeout(timeout);
        logger.error("camera", `VISCA connection error to ${this.host}:${this.port}: ${err.message}`, { action: "visca_error", details: { host: this.host, port: this.port, error: err.message } });
        this.connected = false;
        resolve(false);
      });

      this.socket.on("close", () => {
        this.connected = false;
        logger.info("camera", `VISCA disconnected from ${this.host}:${this.port}`, { action: "visca_disconnected", details: { host: this.host, port: this.port } });
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

  private sendCommand(command: Buffer): void {
    if (!this.socket || !this.connected) {
      logger.warn("camera", `VISCA not connected to ${this.host}, cannot send command`, { action: "visca_send_fail" });
      return;
    }
    this.socket.write(command);
  }

  panTilt(pan: number, tilt: number, speed: number = 0.5): void {
    const panSpeed = Math.max(1, Math.min(PAN_MAX_SPEED, Math.floor(Math.abs(pan) * PAN_MAX_SPEED * speed)));
    const tiltSpeed = Math.max(1, Math.min(TILT_MAX_SPEED, Math.floor(Math.abs(tilt) * TILT_MAX_SPEED * speed)));

    let panDirection: number;
    if (Math.abs(pan) < DEADZONE) {
      panDirection = DIR_STOP;
    } else if (pan < 0) {
      panDirection = DIR_LEFT;
    } else {
      panDirection = DIR_RIGHT;
    }

    let tiltDirection: number;
    if (Math.abs(tilt) < DEADZONE) {
      tiltDirection = DIR_STOP;
    } else if (tilt > 0) {
      tiltDirection = DIR_UP;
    } else {
      tiltDirection = DIR_DOWN;
    }

    const cmd = Buffer.from([
      VISCA_HEADER, ...PAN_TILT_CMD,
      panSpeed,
      tiltSpeed,
      panDirection,
      tiltDirection,
      VISCA_TERMINATOR
    ]);

    logger.debug("camera", `VISCA pan/tilt to ${this.host}: speed=${panSpeed}/${tiltSpeed}, dir=${panDirection}/${tiltDirection}`, { action: "visca_pantilt", details: { host: this.host, panSpeed, tiltSpeed, panDirection, tiltDirection } });
    this.sendCommand(cmd);
  }

  panTiltStop(): void {
    const cmd = Buffer.from([
      VISCA_HEADER, ...PAN_TILT_CMD,
      0x00, 0x00, DIR_STOP, DIR_STOP,
      VISCA_TERMINATOR
    ]);
    this.sendCommand(cmd);
  }

  zoom(zoom: number, speed: number = 0.5): void {
    if (zoom === 0) {
      this.zoomStop();
      return;
    }

    const zoomSpeed = Math.floor(Math.abs(zoom) * ZOOM_MAX_SPEED * speed);
    const clampedSpeed = Math.max(ZOOM_MIN_SPEED, Math.min(ZOOM_MAX_SPEED, zoomSpeed));

    const direction = zoom > 0 ? ZOOM_TELE : ZOOM_WIDE;

    const cmd = Buffer.from([
      VISCA_HEADER, ...ZOOM_CMD,
      direction | clampedSpeed,
      VISCA_TERMINATOR
    ]);

    this.sendCommand(cmd);
  }

  zoomStop(): void {
    const cmd = Buffer.from([VISCA_HEADER, ...ZOOM_CMD, 0x00, VISCA_TERMINATOR]);
    this.sendCommand(cmd);
  }

  focusAuto(): void {
    const cmd = Buffer.from([VISCA_HEADER, ...FOCUS_AUTO_CMD, VISCA_TERMINATOR]);
    this.sendCommand(cmd);
  }

  focusManual(): void {
    const cmd = Buffer.from([VISCA_HEADER, ...FOCUS_MANUAL_CMD, VISCA_TERMINATOR]);
    this.sendCommand(cmd);
  }

  focusFar(speed: number = 0.5): void {
    const s = Math.max(0, Math.min(1, speed));
    const spd = Math.round(s * FOCUS_MAX_SPEED);
    const cmd = Buffer.from([VISCA_HEADER, ...FOCUS_CMD, FOCUS_FAR | spd, VISCA_TERMINATOR]);
    this.sendCommand(cmd);
  }

  focusNear(speed: number = 0.5): void {
    const s = Math.max(0, Math.min(1, speed));
    const spd = Math.round(s * FOCUS_MAX_SPEED);
    const cmd = Buffer.from([VISCA_HEADER, ...FOCUS_CMD, FOCUS_NEAR | spd, VISCA_TERMINATOR]);
    this.sendCommand(cmd);
  }

  focusStop(): void {
    const cmd = Buffer.from([VISCA_HEADER, ...FOCUS_CMD, 0x00, VISCA_TERMINATOR]);
    this.sendCommand(cmd);
  }

  recallPreset(presetNumber: number): void {
    if (presetNumber < 0 || presetNumber > 254) {
      logger.warn("camera", `VISCA invalid preset number: ${presetNumber}`, { action: "visca_invalid_preset", details: { presetNumber } });
      return;
    }

    const cmd = Buffer.from([
      VISCA_HEADER, ...PRESET_RECALL_CMD,
      presetNumber,
      VISCA_TERMINATOR
    ]);

    this.sendCommand(cmd);
  }

  storePreset(presetNumber: number): void {
    if (presetNumber < 0 || presetNumber > 254) {
      logger.warn("camera", `VISCA invalid preset number: ${presetNumber}`, { action: "visca_invalid_preset", details: { presetNumber } });
      return;
    }

    const cmd = Buffer.from([
      VISCA_HEADER, ...PRESET_STORE_CMD,
      presetNumber,
      VISCA_TERMINATOR
    ]);

    this.sendCommand(cmd);
  }

  tallyOn(): void {
    const cmd = Buffer.from([VISCA_HEADER, ...TALLY_ON_CMD, VISCA_TERMINATOR]);
    logger.debug("camera", `VISCA tally ON for ${this.host}:${this.port}`, { action: "visca_tally_on", details: { host: this.host } });
    this.sendCommand(cmd);
  }

  tallyOff(): void {
    const cmd = Buffer.from([VISCA_HEADER, ...TALLY_OFF_CMD, VISCA_TERMINATOR]);
    logger.debug("camera", `VISCA tally OFF for ${this.host}:${this.port}`, { action: "visca_tally_off", details: { host: this.host } });
    this.sendCommand(cmd);
  }

  home(): void {
    const cmd = Buffer.from([VISCA_HEADER, ...HOME_CMD, VISCA_TERMINATOR]);
    this.sendCommand(cmd);
  }
}

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
    Array.from(this.connections.entries()).forEach(([_id, client]) => {
      client.disconnect();
    });
    this.connections.clear();
  }
}

export const cameraManager = new CameraConnectionManager();
