import osc from "osc";

export interface X32Config {
  ip: string;
  port: number;
}

export interface ChannelState {
  channel: number;
  fader: number;
  muted: boolean;
  name: string;
}

export class X32Client {
  private udpPort: any;
  private connected: boolean = false;
  private keepAliveInterval: NodeJS.Timeout | null = null;
  private config: X32Config;
  private channelStates: Map<number, ChannelState> = new Map();
  private onStateChange: ((states: ChannelState[]) => void) | null = null;

  constructor(config: X32Config) {
    this.config = config;
  }

  setStateChangeCallback(callback: (states: ChannelState[]) => void) {
    this.onStateChange = callback;
  }

  async connect(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        this.udpPort = new osc.UDPPort({
          localAddress: "0.0.0.0",
          localPort: 0,
          remoteAddress: this.config.ip,
          remotePort: this.config.port,
          metadata: true
        });

        this.udpPort.on("ready", () => {
          console.log(`[X32] Connected to ${this.config.ip}:${this.config.port}`);
          this.connected = true;
          this.startKeepAlive();
          this.queryInitialState();
          resolve(true);
        });

        this.udpPort.on("error", (error: Error) => {
          console.error("[X32] Error:", error.message);
          this.connected = false;
          resolve(false);
        });

        this.udpPort.on("message", (oscMsg: any) => {
          this.handleMessage(oscMsg);
        });

        this.udpPort.open();

        setTimeout(() => {
          if (!this.connected) {
            resolve(false);
          }
        }, 5000);
      } catch (error) {
        console.error("[X32] Connection error:", error);
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
    console.log("[X32] Disconnected");
  }

  isConnected(): boolean {
    return this.connected;
  }

  private startKeepAlive() {
    this.keepAliveInterval = setInterval(() => {
      if (this.connected) {
        this.send("/xremote", []);
      }
    }, 9000);
  }

  private queryInitialState() {
    for (let ch = 1; ch <= 16; ch++) {
      const chStr = ch.toString().padStart(2, "0");
      this.send(`/ch/${chStr}/mix/fader`, []);
      this.send(`/ch/${chStr}/mix/on`, []);
      this.send(`/ch/${chStr}/config/name`, []);
    }
  }

  private handleMessage(oscMsg: any) {
    const { address, args } = oscMsg;
    
    const chMatch = address.match(/^\/ch\/(\d{2})\/mix\/(fader|on)$/);
    if (chMatch) {
      const channel = parseInt(chMatch[1]);
      const param = chMatch[2];
      const value = args[0]?.value;

      let state = this.channelStates.get(channel) || {
        channel,
        fader: 0,
        muted: false,
        name: `Ch ${channel}`
      };

      if (param === "fader" && typeof value === "number") {
        state.fader = value;
      } else if (param === "on" && typeof value === "number") {
        state.muted = value === 0;
      }

      this.channelStates.set(channel, state);

      if (this.onStateChange) {
        this.onStateChange(Array.from(this.channelStates.values()));
      }
    }

    const nameMatch = address.match(/^\/ch\/(\d{2})\/config\/name$/);
    if (nameMatch && args[0]?.value) {
      const channel = parseInt(nameMatch[1]);
      let state = this.channelStates.get(channel) || {
        channel,
        fader: 0,
        muted: false,
        name: `Ch ${channel}`
      };
      state.name = args[0].value;
      this.channelStates.set(channel, state);
    }
  }

  private send(address: string, args: any[]) {
    if (!this.connected || !this.udpPort) return;
    
    try {
      this.udpPort.send({ address, args });
    } catch (error) {
      console.error("[X32] Send error:", error);
    }
  }

  setChannelFader(channel: number, value: number) {
    const chStr = channel.toString().padStart(2, "0");
    this.send(`/ch/${chStr}/mix/fader`, [{ type: "f", value: Math.max(0, Math.min(1, value)) }]);
  }

  setChannelMute(channel: number, muted: boolean) {
    const chStr = channel.toString().padStart(2, "0");
    this.send(`/ch/${chStr}/mix/on`, [{ type: "i", value: muted ? 0 : 1 }]);
  }

  setMainFader(value: number) {
    this.send("/main/st/mix/fader", [{ type: "f", value: Math.max(0, Math.min(1, value)) }]);
  }

  setMainMute(muted: boolean) {
    this.send("/main/st/mix/on", [{ type: "i", value: muted ? 0 : 1 }]);
  }

  getChannelStates(): ChannelState[] {
    return Array.from(this.channelStates.values());
  }
}

class X32Manager {
  private client: X32Client | null = null;

  async connect(ip: string, port: number = 10023): Promise<boolean> {
    if (this.client) {
      this.client.disconnect();
    }
    
    this.client = new X32Client({ ip, port });
    return await this.client.connect();
  }

  disconnect() {
    if (this.client) {
      this.client.disconnect();
      this.client = null;
    }
  }

  getClient(): X32Client | null {
    return this.client;
  }

  isConnected(): boolean {
    return this.client?.isConnected() || false;
  }
}

export const x32Manager = new X32Manager();
