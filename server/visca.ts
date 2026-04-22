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

type PendingViscaCommand = {
  description: string;
  ackSocket: number | null;
  resolveOnAckTimeout: boolean;
  resolve: () => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
};

function formatViscaBytes(packet: Buffer) {
  return Array.from(packet).map((byte) => byte.toString(16).padStart(2, "0").toUpperCase()).join(" ");
}

function viscaErrorMessage(code: number) {
  switch (code) {
    case 0x02:
      return "VISCA syntax error";
    case 0x03:
      return "VISCA command buffer full";
    case 0x04:
      return "VISCA command canceled";
    case 0x05:
      return "VISCA no socket";
    case 0x41:
      return "VISCA command not executable";
    default:
      return `VISCA error 0x${code.toString(16).padStart(2, "0").toUpperCase()}`;
  }
}

export class VISCAClient {
  private host: string;
  private port: number;
  private socket: net.Socket | null = null;
  private connected: boolean = false;
  private responseBuffer: number[] = [];
  private pendingCommand: PendingViscaCommand | null = null;
  private commandChain: Promise<void> = Promise.resolve();

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
        if (this.pendingCommand) {
          clearTimeout(this.pendingCommand.timeout);
          this.pendingCommand.reject(new Error("VISCA socket closed"));
          this.pendingCommand = null;
        }
        logger.info("camera", `VISCA disconnected from ${this.host}:${this.port}`, { action: "visca_disconnected", details: { host: this.host, port: this.port } });
      });

      this.socket.on("data", (chunk: Buffer) => {
        this.handleIncomingData(chunk);
      });

      this.socket.connect(this.port, this.host);
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
      this.connected = false;
      this.responseBuffer = [];
      if (this.pendingCommand) {
        clearTimeout(this.pendingCommand.timeout);
        this.pendingCommand.reject(new Error("VISCA socket disconnected"));
        this.pendingCommand = null;
      }
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  private sendCommand(command: Buffer, description: string): void {
    if (!this.socket || !this.connected) {
      logger.warn("camera", `VISCA not connected to ${this.host}, cannot send ${description}`, { action: "visca_send_fail", details: { host: this.host, description } });
      return;
    }
    logger.debug("camera", `VISCA send ${description} -> ${this.host}:${this.port} [${formatViscaBytes(command)}]`, {
      action: "visca_send",
      details: { host: this.host, port: this.port, description, command: formatViscaBytes(command) },
    });
    this.socket.write(command);
  }

  private handleIncomingData(chunk: Buffer) {
    for (const byte of chunk.values()) {
      this.responseBuffer.push(byte);
      if (byte === VISCA_TERMINATOR) {
        const packet = Buffer.from(this.responseBuffer);
        this.responseBuffer = [];
        this.handleResponsePacket(packet);
      }
    }
  }

  private handleResponsePacket(packet: Buffer) {
    logger.debug("camera", `VISCA recv ${this.host}:${this.port} [${formatViscaBytes(packet)}]`, {
      action: "visca_receive",
      details: { host: this.host, port: this.port, packet: formatViscaBytes(packet) },
    });

    if (packet.length < 2) return;
    const type = packet[1] & 0xf0;
    const socketNo = packet[1] & 0x0f;
    const pending = this.pendingCommand;
    if (!pending) return;

    if (type === 0x40) {
      pending.ackSocket = socketNo;
      return;
    }

    if (type === 0x50) {
      if (pending.ackSocket === null || pending.ackSocket === socketNo) {
        clearTimeout(pending.timeout);
        this.pendingCommand = null;
        pending.resolve();
      }
      return;
    }

    if (type === 0x60) {
      const errorCode = packet[2] ?? 0;
      if (pending.ackSocket === null || pending.ackSocket === socketNo) {
        clearTimeout(pending.timeout);
        this.pendingCommand = null;
        pending.reject(new Error(viscaErrorMessage(errorCode)));
      }
    }
  }

  private enqueueCommandAwaitCompletion(
    command: Buffer,
    description: string,
    options: {
      timeoutMs?: number;
      retriesRemaining?: number;
      resolveOnAckTimeout?: boolean;
    } = {},
  ): Promise<void> {
    const timeoutMs = options.timeoutMs ?? 1500;
    const retriesRemaining = options.retriesRemaining ?? 1;
    const resolveOnAckTimeout = options.resolveOnAckTimeout ?? false;

    const run = async () => {
      if (!this.socket || !this.connected) {
        throw new Error("VISCA not connected");
      }

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (this.pendingCommand?.description === description) {
            const pending = this.pendingCommand;
            this.pendingCommand = null;
            if (pending.resolveOnAckTimeout && pending.ackSocket !== null) {
              logger.warn("camera", `VISCA ${description} on ${this.host}:${this.port} acknowledged without completion; treating as success`, {
                action: "visca_ack_timeout",
                details: { host: this.host, port: this.port, description, ackSocket: pending.ackSocket, timeoutMs },
              });
              resolve();
              return;
            }
          }
          reject(new Error(`${description} timed out`));
        }, timeoutMs);

        this.pendingCommand = {
          description,
          ackSocket: null,
          resolveOnAckTimeout,
          timeout,
          resolve,
          reject,
        };

        this.sendCommand(command, description);
      }).catch(async (error) => {
        const message = error instanceof Error ? error.message : String(error);
        if (retriesRemaining > 0 && /buffer full/i.test(message)) {
          logger.warn("camera", `Retrying ${description} after VISCA buffer-full response`, {
            action: "visca_retry",
            details: { host: this.host, port: this.port, description, retriesRemaining },
          });
          await new Promise((resolve) => setTimeout(resolve, 150));
          return this.enqueueCommandAwaitCompletion(command, description, {
            timeoutMs,
            retriesRemaining: retriesRemaining - 1,
            resolveOnAckTimeout,
          });
        }
        throw error;
      });
    };

    const next = this.commandChain.then(run, run);
    this.commandChain = next.catch(() => undefined);
    return next;
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
    this.sendCommand(cmd, "pan/tilt");
  }

  panTiltStop(): void {
    const cmd = Buffer.from([
      VISCA_HEADER, ...PAN_TILT_CMD,
      0x00, 0x00, DIR_STOP, DIR_STOP,
      VISCA_TERMINATOR
    ]);
    this.sendCommand(cmd, "pan/tilt stop");
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

    this.sendCommand(cmd, "zoom");
  }

  zoomStop(): void {
    const cmd = Buffer.from([VISCA_HEADER, ...ZOOM_CMD, 0x00, VISCA_TERMINATOR]);
    this.sendCommand(cmd, "zoom stop");
  }

  focusAuto(): void {
    const cmd = Buffer.from([VISCA_HEADER, ...FOCUS_AUTO_CMD, VISCA_TERMINATOR]);
    this.sendCommand(cmd, "focus auto");
  }

  focusManual(): void {
    const cmd = Buffer.from([VISCA_HEADER, ...FOCUS_MANUAL_CMD, VISCA_TERMINATOR]);
    this.sendCommand(cmd, "focus manual");
  }

  focusFar(speed: number = 0.5): void {
    const s = Math.max(0, Math.min(1, speed));
    const spd = Math.round(s * FOCUS_MAX_SPEED);
    const cmd = Buffer.from([VISCA_HEADER, ...FOCUS_CMD, FOCUS_FAR | spd, VISCA_TERMINATOR]);
    this.sendCommand(cmd, "focus far");
  }

  focusNear(speed: number = 0.5): void {
    const s = Math.max(0, Math.min(1, speed));
    const spd = Math.round(s * FOCUS_MAX_SPEED);
    const cmd = Buffer.from([VISCA_HEADER, ...FOCUS_CMD, FOCUS_NEAR | spd, VISCA_TERMINATOR]);
    this.sendCommand(cmd, "focus near");
  }

  focusStop(): void {
    const cmd = Buffer.from([VISCA_HEADER, ...FOCUS_CMD, 0x00, VISCA_TERMINATOR]);
    this.sendCommand(cmd, "focus stop");
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

    this.sendCommand(cmd, `recall preset ${presetNumber + 1}`);
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

    this.sendCommand(cmd, `store preset ${presetNumber + 1}`);
  }

  async storePresetAsync(presetNumber: number): Promise<void> {
    if (presetNumber < 0 || presetNumber > 254) {
      throw new Error(`Invalid VISCA preset number: ${presetNumber}`);
    }

    const cmd = Buffer.from([
      VISCA_HEADER, ...PRESET_STORE_CMD,
      presetNumber,
      VISCA_TERMINATOR
    ]);

    const description = `store preset ${presetNumber + 1}`;

    try {
      await this.enqueueCommandAwaitCompletion(cmd, description, {
        timeoutMs: 5000,
        resolveOnAckTimeout: true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/timed out/i.test(message) || !this.socket || !this.connected) {
        throw error;
      }

      logger.warn("camera", `VISCA ${description} on ${this.host}:${this.port} gave no response; retrying once and assuming success`, {
        action: "visca_store_fallback",
        details: { host: this.host, port: this.port, description },
      });

      this.sendCommand(cmd, `${description} fallback`);
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
  }

  tallyOn(): void {
    const cmd = Buffer.from([VISCA_HEADER, ...TALLY_ON_CMD, VISCA_TERMINATOR]);
    logger.debug("camera", `VISCA tally ON for ${this.host}:${this.port}`, { action: "visca_tally_on", details: { host: this.host } });
    this.sendCommand(cmd, "tally on");
  }

  tallyOff(): void {
    const cmd = Buffer.from([VISCA_HEADER, ...TALLY_OFF_CMD, VISCA_TERMINATOR]);
    logger.debug("camera", `VISCA tally OFF for ${this.host}:${this.port}`, { action: "visca_tally_off", details: { host: this.host } });
    this.sendCommand(cmd, "tally off");
  }

  home(): void {
    const cmd = Buffer.from([VISCA_HEADER, ...HOME_CMD, VISCA_TERMINATOR]);
    this.sendCommand(cmd, "home");
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
