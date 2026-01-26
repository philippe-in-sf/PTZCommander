import { Atem, AtemState } from "atem-connection";

export interface AtemConfig {
  ip: string;
}

export interface AtemInputInfo {
  inputId: number;
  shortName: string;
  longName: string;
}

export interface AtemSwitcherState {
  connected: boolean;
  programInput: number;
  previewInput: number;
  inTransition: boolean;
  transitionPosition: number;
  inputs: AtemInputInfo[];
}

export class AtemClient {
  private atem: Atem;
  private connected: boolean = false;
  private config: AtemConfig;
  private onStateChange: ((state: AtemSwitcherState) => void) | null = null;

  constructor(config: AtemConfig) {
    this.config = config;
    this.atem = new Atem();

    this.atem.on("connected", () => {
      console.log(`[ATEM] Connected to ${this.config.ip}`);
      this.connected = true;
      this.notifyStateChange();
    });

    this.atem.on("disconnected", () => {
      console.log("[ATEM] Disconnected");
      this.connected = false;
      this.notifyStateChange();
    });

    this.atem.on("stateChanged", () => {
      this.notifyStateChange();
    });

    this.atem.on("error", (error) => {
      console.error("[ATEM] Error:", error);
    });
  }

  setStateChangeCallback(callback: (state: AtemSwitcherState) => void) {
    this.onStateChange = callback;
  }

  private notifyStateChange() {
    if (this.onStateChange) {
      this.onStateChange(this.getState());
    }
  }

  async connect(): Promise<boolean> {
    try {
      await this.atem.connect(this.config.ip);
      return true;
    } catch (error) {
      console.error("[ATEM] Connection error:", error);
      return false;
    }
  }

  disconnect() {
    this.atem.disconnect();
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  getState(): AtemSwitcherState {
    const state = this.atem.state;
    const mixEffect = state?.video?.mixEffects?.[0];
    
    const inputs: AtemInputInfo[] = [];
    if (state?.inputs) {
      for (const [id, input] of Object.entries(state.inputs)) {
        if (input) {
          inputs.push({
            inputId: parseInt(id),
            shortName: input.shortName || `In ${id}`,
            longName: input.longName || `Input ${id}`,
          });
        }
      }
    }

    return {
      connected: this.connected,
      programInput: mixEffect?.programInput ?? 0,
      previewInput: mixEffect?.previewInput ?? 0,
      inTransition: mixEffect?.transitionPosition?.inTransition ?? false,
      transitionPosition: mixEffect?.transitionPosition?.handlePosition ?? 0,
      inputs: inputs.filter(i => i.inputId >= 1 && i.inputId <= 20),
    };
  }

  async setProgramInput(inputId: number): Promise<void> {
    if (!this.connected) return;
    await this.atem.changeProgramInput(inputId);
  }

  async setPreviewInput(inputId: number): Promise<void> {
    if (!this.connected) return;
    await this.atem.changePreviewInput(inputId);
  }

  async cut(): Promise<void> {
    if (!this.connected) return;
    await this.atem.cut();
  }

  async autoTransition(): Promise<void> {
    if (!this.connected) return;
    await this.atem.autoTransition();
  }

  async fadeToBlack(): Promise<void> {
    if (!this.connected) return;
    await this.atem.fadeToBlack();
  }

  async setTransitionPosition(position: number): Promise<void> {
    if (!this.connected) return;
    await this.atem.setTransitionPosition(position);
  }
}

class AtemManager {
  private client: AtemClient | null = null;
  private stateCallback: ((state: AtemSwitcherState) => void) | null = null;

  setStateChangeCallback(callback: (state: AtemSwitcherState) => void) {
    this.stateCallback = callback;
    if (this.client) {
      this.client.setStateChangeCallback(callback);
    }
  }

  async connect(ip: string): Promise<boolean> {
    if (this.client) {
      this.client.disconnect();
    }

    this.client = new AtemClient({ ip });

    if (this.stateCallback) {
      this.client.setStateChangeCallback(this.stateCallback);
    }

    return await this.client.connect();
  }

  disconnect() {
    if (this.client) {
      this.client.disconnect();
      this.client = null;
    }
  }

  getClient(): AtemClient | null {
    return this.client;
  }

  isConnected(): boolean {
    return this.client?.isConnected() || false;
  }

  getState(): AtemSwitcherState | null {
    return this.client?.getState() || null;
  }
}

export const atemManager = new AtemManager();
