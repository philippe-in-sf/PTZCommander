import osc from "osc";
import { logger } from "./logger";
import { ExponentialBackoff } from "./reconnect";

export interface X32Config {
  ip: string;
  port: number;
}

export type MixerSection = "ch" | "bus" | "auxin" | "fxrtn" | "mtx" | "dca" | "main";

export interface ChannelState {
  channel: number;
  section: MixerSection;
  fader: number;
  muted: boolean;
  name: string;
}

const SECTION_CONFIG: Record<MixerSection, { count: number; oscPrefix: string; padDigits: number; faderPath: string; mutePath: string; namePath: string }> = {
  ch:    { count: 32, oscPrefix: "/ch",    padDigits: 2, faderPath: "mix/fader", mutePath: "mix/on", namePath: "config/name" },
  bus:   { count: 16, oscPrefix: "/bus",   padDigits: 2, faderPath: "mix/fader", mutePath: "mix/on", namePath: "config/name" },
  auxin: { count: 8,  oscPrefix: "/auxin", padDigits: 2, faderPath: "mix/fader", mutePath: "mix/on", namePath: "config/name" },
  fxrtn: { count: 8,  oscPrefix: "/fxrtn", padDigits: 2, faderPath: "mix/fader", mutePath: "mix/on", namePath: "config/name" },
  mtx:   { count: 6,  oscPrefix: "/mtx",   padDigits: 2, faderPath: "mix/fader", mutePath: "mix/on", namePath: "config/name" },
  dca:   { count: 8,  oscPrefix: "/dca",   padDigits: 1, faderPath: "fader",     mutePath: "on",     namePath: "" },
  main:  { count: 1,  oscPrefix: "/main/st", padDigits: 0, faderPath: "mix/fader", mutePath: "mix/on", namePath: "" },
};
const MIXER_SECTIONS = Object.keys(SECTION_CONFIG) as MixerSection[];

export class X32Client {
  private udpPort: InstanceType<typeof osc.UDPPort> | null = null;
  private connected: boolean = false;
  private verified: boolean = false;
  private keepAliveInterval: NodeJS.Timeout | null = null;
  private lastMessageAt = 0;
  private config: X32Config;
  private sectionStates: Map<string, ChannelState> = new Map();
  private onStateChange: ((section: MixerSection, states: ChannelState[]) => void) | null = null;
  private onDisconnect: (() => void) | null = null;

  constructor(config: X32Config) {
    this.config = config;
  }

  setStateChangeCallback(callback: (section: MixerSection, states: ChannelState[]) => void) {
    this.onStateChange = callback;
  }

  setDisconnectCallback(callback: (() => void) | null) {
    this.onDisconnect = callback;
  }

  async connect(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        this.udpPort = new osc.UDPPort({
          localAddress: process.env.X32_LOCAL_ADDRESS || "0.0.0.0",
          localPort: 0,
          remoteAddress: this.config.ip,
          remotePort: this.config.port,
          metadata: true
        });

        this.udpPort.on("ready", () => {
          logger.info("mixer", `X32 UDP transport ready for ${this.config.ip}:${this.config.port}; waiting for mixer response`, { action: "x32_transport_ready", details: { ip: this.config.ip, port: this.config.port } });
          this.connected = true;
          this.verified = false;
          this.lastMessageAt = Date.now();
          this.startKeepAlive();
          this.queryInitialState();
        });

        this.udpPort.on("error", (error: Error) => {
          if (!this.connected) return;
          logger.error("mixer", `X32 connection error: ${error.message}`, { action: "x32_error", details: { ip: this.config.ip, port: this.config.port, error: error.message } });
          this.handleTransportLoss();
          resolve(false);
        });

        this.udpPort.on("message", (oscMsg: { address: string; args: Array<{ value: unknown }> }) => {
          this.lastMessageAt = Date.now();
          if (!this.verified) {
            this.verified = true;
            logger.info("mixer", `X32 responded at ${this.config.ip}:${this.config.port}`, { action: "x32_connected", details: { ip: this.config.ip, port: this.config.port } });
            resolve(true);
          }
          this.handleMessage(oscMsg);
        });

        this.udpPort.open();

        setTimeout(() => {
          if (!this.verified) {
            this.handleTransportLoss();
            resolve(false);
          }
        }, X32Client.CONNECTION_TIMEOUT_MS);
      } catch (error: any) {
        logger.error("mixer", `X32 connection exception: ${error.message}`, { action: "x32_connect_exception", details: { error: error.message } });
        resolve(false);
      }
    });
  }

  disconnect() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
    if (this.udpPort) {
      this.udpPort.close();
    }
    this.connected = false;
    this.verified = false;
    this.clearState();
    logger.info("mixer", "X32 disconnected", { action: "x32_disconnected" });
  }

  isConnected(): boolean {
    return this.connected && this.verified;
  }

  private static readonly KEEP_ALIVE_INTERVAL_MS = 9000;
  private static readonly CONNECTION_TIMEOUT_MS = 5000;
  private static readonly SILENCE_TIMEOUT_MS = 30_000;

  private startKeepAlive() {
    this.keepAliveInterval = setInterval(() => {
      if (this.connected) {
        if (Date.now() - this.lastMessageAt > X32Client.SILENCE_TIMEOUT_MS) {
          logger.warn("mixer", "X32 stopped responding", { action: "x32_silence_timeout" });
          this.handleTransportLoss();
          return;
        }
        this.send("/xremote", []);
      }
    }, X32Client.KEEP_ALIVE_INTERVAL_MS);
  }

  private stateKey(section: MixerSection, channel: number): string {
    return `${section}:${channel}`;
  }

  private clearState() {
    if (this.sectionStates.size === 0) return;
    this.sectionStates.clear();
    for (const section of MIXER_SECTIONS) this.onStateChange?.(section, []);
  }

  private handleTransportLoss() {
    const wasConnected = this.connected;
    this.connected = false;
    this.verified = false;
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
    this.clearState();
    if (wasConnected) this.onDisconnect?.();
  }

  private queryInitialState() {
    const sectionsToQuery: MixerSection[] = ["ch", "bus", "auxin", "fxrtn", "mtx", "dca"];
    for (const section of sectionsToQuery) {
      this.querySectionState(section);
    }
    this.send("/main/st/mix/fader", []);
    this.send("/main/st/mix/on", []);
  }

  querySectionState(section: MixerSection) {
    const cfg = SECTION_CONFIG[section];
    if (!cfg || section === "main") return;

    for (let ch = 1; ch <= cfg.count; ch++) {
      const chStr = cfg.padDigits > 0 ? ch.toString().padStart(cfg.padDigits, "0") : ch.toString();
      this.send(`${cfg.oscPrefix}/${chStr}/${cfg.faderPath}`, []);
      this.send(`${cfg.oscPrefix}/${chStr}/${cfg.mutePath}`, []);
      if (cfg.namePath) {
        this.send(`${cfg.oscPrefix}/${chStr}/${cfg.namePath}`, []);
      }
    }
  }

  private handleMessage(oscMsg: { address: string; args: Array<{ value: unknown }> }) {
    const { address, args } = oscMsg;
    const value = args[0]?.value;

    if (address === "/main/st/mix/fader" && typeof value === "number") {
      const key = this.stateKey("main", 1);
      const state = this.sectionStates.get(key) || { channel: 1, section: "main" as MixerSection, fader: 0, muted: false, name: "Main LR" };
      state.fader = value;
      this.sectionStates.set(key, state);
      this.notifyStateChange("main");
      return;
    }
    if (address === "/main/st/mix/on" && typeof value === "number") {
      const key = this.stateKey("main", 1);
      const state = this.sectionStates.get(key) || { channel: 1, section: "main" as MixerSection, fader: 0, muted: false, name: "Main LR" };
      state.muted = value === 0;
      this.sectionStates.set(key, state);
      this.notifyStateChange("main");
      return;
    }

    for (const [sectionName, cfg] of Object.entries(SECTION_CONFIG)) {
      if (sectionName === "main") continue;
      const section = sectionName as MixerSection;

      const chPattern = cfg.padDigits > 0 ? `(\\d{${cfg.padDigits}})` : `(\\d+)`;

      const faderRegex = new RegExp(`^${cfg.oscPrefix.replace(/\//g, "\\/")}\\/${chPattern}\\/${cfg.faderPath.replace(/\//g, "\\/")}$`);
      const muteRegex = new RegExp(`^${cfg.oscPrefix.replace(/\//g, "\\/")}\\/${chPattern}\\/${cfg.mutePath.replace(/\//g, "\\/")}$`);

      const faderMatch = address.match(faderRegex);
      if (faderMatch && typeof value === "number") {
        const ch = parseInt(faderMatch[1]);
        const key = this.stateKey(section, ch);
        const state = this.sectionStates.get(key) || this.defaultState(section, ch);
        state.fader = value;
        this.sectionStates.set(key, state);
        this.notifyStateChange(section);
        return;
      }

      const muteMatch = address.match(muteRegex);
      if (muteMatch && typeof value === "number") {
        const ch = parseInt(muteMatch[1]);
        const key = this.stateKey(section, ch);
        const state = this.sectionStates.get(key) || this.defaultState(section, ch);
        state.muted = value === 0;
        this.sectionStates.set(key, state);
        this.notifyStateChange(section);
        return;
      }

      if (cfg.namePath) {
        const nameRegex = new RegExp(`^${cfg.oscPrefix.replace(/\//g, "\\/")}\\/${chPattern}\\/${cfg.namePath.replace(/\//g, "\\/")}$`);
        const nameMatch = address.match(nameRegex);
        if (nameMatch && typeof args[0]?.value === "string") {
          const ch = parseInt(nameMatch[1]);
          const key = this.stateKey(section, ch);
          const state = this.sectionStates.get(key) || this.defaultState(section, ch);
          state.name = args[0].value;
          this.sectionStates.set(key, state);
          return;
        }
      }
    }
  }

  private defaultState(section: MixerSection, channel: number): ChannelState {
    const labels: Record<MixerSection, string> = {
      ch: `Ch ${channel}`,
      bus: `Bus ${channel}`,
      auxin: `Aux In ${channel}`,
      fxrtn: `FX Rtn ${channel}`,
      mtx: `Matrix ${channel}`,
      dca: `DCA ${channel}`,
      main: `Main LR`,
    };
    return { channel, section, fader: 0, muted: false, name: labels[section] };
  }

  private notifyStateChange(section: MixerSection) {
    if (this.onStateChange) {
      this.onStateChange(section, this.getSectionStates(section));
    }
  }

  private send(address: string, args: Array<{ type: string; value: unknown } | Record<string, never>>) {
    if (!this.connected || !this.udpPort) return;
    
    try {
      this.udpPort.send({ address, args });
    } catch (error: any) {
      logger.error("mixer", `X32 OSC send error: ${error.message}`, { action: "x32_send_error", details: { address, error: error.message } });
    }
  }

  setSectionFader(section: MixerSection, channel: number, value: number) {
    const clampedValue = Math.max(0, Math.min(1, value));
    if (section === "main") {
      this.send("/main/st/mix/fader", [{ type: "f", value: clampedValue }]);
      return;
    }
    const cfg = SECTION_CONFIG[section];
    const chStr = cfg.padDigits > 0 ? channel.toString().padStart(cfg.padDigits, "0") : channel.toString();
    this.send(`${cfg.oscPrefix}/${chStr}/${cfg.faderPath}`, [{ type: "f", value: clampedValue }]);
  }

  setSectionMute(section: MixerSection, channel: number, muted: boolean) {
    if (section === "main") {
      this.send("/main/st/mix/on", [{ type: "i", value: muted ? 0 : 1 }]);
      return;
    }
    const cfg = SECTION_CONFIG[section];
    const chStr = cfg.padDigits > 0 ? channel.toString().padStart(cfg.padDigits, "0") : channel.toString();
    this.send(`${cfg.oscPrefix}/${chStr}/${cfg.mutePath}`, [{ type: "i", value: muted ? 0 : 1 }]);
  }

  setChannelFader(channel: number, value: number) {
    this.setSectionFader("ch", channel, value);
  }

  setChannelMute(channel: number, muted: boolean) {
    this.setSectionMute("ch", channel, muted);
  }

  setMainFader(value: number) {
    this.setSectionFader("main", 1, value);
  }

  setMainMute(muted: boolean) {
    this.setSectionMute("main", 1, muted);
  }

  getSectionStates(section: MixerSection): ChannelState[] {
    const results: ChannelState[] = [];
    this.sectionStates.forEach((state, key) => {
      if (key.startsWith(`${section}:`)) {
        results.push(state);
      }
    });
    return results.sort((a, b) => a.channel - b.channel);
  }

  getChannelStates(): ChannelState[] {
    return this.getSectionStates("ch");
  }

  getAllStates(): Record<MixerSection, ChannelState[]> {
    const sections: MixerSection[] = ["ch", "bus", "auxin", "fxrtn", "mtx", "dca", "main"];
    const result: Record<string, ChannelState[]> = {};
    for (const s of sections) {
      result[s] = this.getSectionStates(s);
    }
    return result as Record<MixerSection, ChannelState[]>;
  }
}

class X32Manager {
  private client: X32Client | null = null;
  private stateCallback: ((section: MixerSection, states: ChannelState[]) => void) | null = null;
  private config: X32Config | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private backoff = new ExponentialBackoff();
  private disabled = false;
  private connectionCallback: ((status: "online" | "offline" | "reconnecting") => void) | null = null;

  setStateChangeCallback(callback: (section: MixerSection, states: ChannelState[]) => void) {
    this.stateCallback = callback;
    if (this.client) {
      this.client.setStateChangeCallback(callback);
    }
  }

  setConnectionChangeCallback(callback: ((status: "online" | "offline" | "reconnecting") => void) | null) {
    this.connectionCallback = callback;
  }

  async connect(ip: string, port: number = 10023): Promise<boolean> {
    this.config = { ip, port };
    this.disabled = false;
    this.clearReconnectTimer();
    if (this.client) {
      this.client.setDisconnectCallback(null);
      this.client.disconnect();
    }
    
    this.client = new X32Client({ ip, port });
    this.client.setDisconnectCallback(() => this.scheduleReconnect("socket_error"));
    
    if (this.stateCallback) {
      this.client.setStateChangeCallback(this.stateCallback);
    }
    
    const connected = await this.client.connect();
    if (connected) {
      this.backoff.reset();
      this.connectionCallback?.("online");
    }
    else this.scheduleReconnect("connect_failed");
    return connected;
  }

  disconnect() {
    this.disabled = true;
    this.clearReconnectTimer();
    if (this.client) {
      this.client.disconnect();
      this.client = null;
    }
    this.config = null;
    this.connectionCallback?.("offline");
  }

  getClient(): X32Client | null {
    return this.client;
  }

  isConnected(): boolean {
    return this.client?.isConnected() || false;
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private scheduleReconnect(reason: string) {
    if (this.disabled || this.reconnectTimer || !this.config) return;
    const delayMs = this.backoff.nextDelayMs();
    this.connectionCallback?.("reconnecting");
    logger.warn("mixer", `Scheduling X32 reconnect in ${delayMs}ms`, {
      action: "x32_reconnect_scheduled",
      details: { ...this.config, reason, delayMs },
    });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.config || this.disabled) return;
      this.connect(this.config.ip, this.config.port).catch((error) => {
        logger.error("mixer", `X32 reconnect failed: ${error instanceof Error ? error.message : String(error)}`, {
          action: "x32_reconnect_error",
        });
        this.scheduleReconnect("reconnect_error");
      });
    }, delayMs);
  }
}

export const x32Manager = new X32Manager();
