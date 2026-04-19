import { logger } from "./logger";

export interface AtemConfig {
  ip: string;
}

export interface AtemInputInfo {
  inputId: number;
  shortName: string;
  longName: string;
}

export interface AtemDSKState {
  index: number;
  onAir: boolean;
  tie: boolean;
  rate: number;
  inTransition: boolean;
  isAuto: boolean;
  remainingFrames: number;
}

export interface AtemUSKState {
  index: number;
  onAir: boolean;
  type: number;
  fillSource: number;
  cutSource: number;
  flyEnabled: boolean;
}

export interface AtemFTBState {
  isFullyBlack: boolean;
  inTransition: boolean;
  remainingFrames: number;
  rate: number;
}

export interface AtemTransitionState {
  style: number;
  nextStyle: number;
  inTransition: boolean;
  position: number;
  remainingFrames: number;
  mixRate: number;
  dipRate: number;
  wipeRate: number;
  dveRate: number;
  previewEnabled: boolean;
}

export interface AtemMacroState {
  index: number;
  name: string;
  isUsed: boolean;
  hasUnsupportedOps: boolean;
}

export interface AtemMacroPlayerState {
  isRunning: boolean;
  isWaiting: boolean;
  loop: boolean;
  macroIndex: number;
}

export interface AtemSwitcherState {
  connected: boolean;
  programInput: number;
  previewInput: number;
  inTransition: boolean;
  transitionPosition: number;
  inputs: AtemInputInfo[];
  transition: AtemTransitionState;
  fadeToBlack: AtemFTBState;
  downstreamKeyers: AtemDSKState[];
  upstreamKeyers: AtemUSKState[];
  macroPlayer: AtemMacroPlayerState;
  macros: AtemMacroState[];
  auxOutputs: number[];
}

type AtemInstance = any;
type AtemConstructor = new () => AtemInstance;

let atemConstructorPromise: Promise<AtemConstructor> | null = null;

async function loadAtemConstructor(): Promise<AtemConstructor> {
  if (!atemConstructorPromise) {
    atemConstructorPromise = import("atem-connection").then((module) => module.Atem as AtemConstructor);
  }
  return atemConstructorPromise;
}

export class AtemClient {
  private atem: AtemInstance | null = null;
  private connected: boolean = false;
  private config: AtemConfig;
  private onStateChange: ((state: AtemSwitcherState) => void) | null = null;

  constructor(config: AtemConfig) {
    this.config = config;
  }

  private async getAtem(): Promise<AtemInstance> {
    if (this.atem) return this.atem;

    const Atem = await loadAtemConstructor();
    const atem = new Atem();

    atem.on("connected", () => {
      logger.info("switcher", `ATEM connected to ${this.config.ip}`, { action: "atem_connected", details: { ip: this.config.ip } });
      this.connected = true;
      this.notifyStateChange();
    });

    atem.on("disconnected", () => {
      logger.info("switcher", "ATEM disconnected", { action: "atem_disconnected" });
      this.connected = false;
      this.notifyStateChange();
    });

    atem.on("stateChanged", () => {
      this.notifyStateChange();
    });

    atem.on("error", (error: string | Error) => {
      const message = error instanceof Error ? error.message : error;
      logger.error("switcher", `ATEM error: ${message}`, { action: "atem_error", details: { error: message } });
    });

    this.atem = atem;
    return atem;
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
      const atem = await this.getAtem();
      await atem.connect(this.config.ip);
      return true;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("switcher", `ATEM connection error: ${message}`, { action: "atem_connect_error", details: { error: message } });
      return false;
    }
  }

  disconnect() {
    this.atem?.disconnect();
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  getState(): AtemSwitcherState {
    const state = this.atem?.state;
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

    const downstreamKeyers: AtemDSKState[] = [];
    if (state?.video?.downstreamKeyers) {
      state.video.downstreamKeyers.forEach((dsk, i) => {
        if (dsk) {
          downstreamKeyers.push({
            index: i,
            onAir: dsk.onAir ?? false,
            tie: dsk.properties?.tie ?? false,
            rate: dsk.properties?.rate ?? 30,
            inTransition: dsk.inTransition ?? false,
            isAuto: dsk.isAuto ?? false,
            remainingFrames: dsk.remainingFrames ?? 0,
          });
        }
      });
    }

    const upstreamKeyers: AtemUSKState[] = [];
    if (mixEffect?.upstreamKeyers) {
      mixEffect.upstreamKeyers.forEach((usk, i) => {
        if (usk) {
          upstreamKeyers.push({
            index: i,
            onAir: usk.onAir ?? false,
            type: usk.mixEffectKeyType ?? 0,
            fillSource: usk.fillSource ?? 0,
            cutSource: usk.cutSource ?? 0,
            flyEnabled: usk.flyEnabled ?? false,
          });
        }
      });
    }

    const transitionProps = mixEffect?.transitionProperties;
    const transitionSettings = mixEffect?.transitionSettings;
    const transition: AtemTransitionState = {
      style: transitionProps?.style ?? 0,
      nextStyle: transitionProps?.nextStyle ?? 0,
      inTransition: mixEffect?.transitionPosition?.inTransition ?? false,
      position: mixEffect?.transitionPosition?.handlePosition ?? 0,
      remainingFrames: mixEffect?.transitionPosition?.remainingFrames ?? 0,
      mixRate: transitionSettings?.mix?.rate ?? 30,
      dipRate: transitionSettings?.dip?.rate ?? 30,
      wipeRate: transitionSettings?.wipe?.rate ?? 30,
      dveRate: transitionSettings?.DVE?.rate ?? 30,
      previewEnabled: mixEffect?.transitionPreview ?? false,
    };

    const ftb = mixEffect?.fadeToBlack;
    const fadeToBlack: AtemFTBState = {
      isFullyBlack: ftb?.isFullyBlack ?? false,
      inTransition: ftb?.inTransition ?? false,
      remainingFrames: ftb?.remainingFrames ?? 0,
      rate: ftb?.rate ?? 30,
    };

    const macros: AtemMacroState[] = [];
    if (state?.macro?.macroProperties) {
      state.macro.macroProperties.forEach((macro, i) => {
        if (macro && macro.isUsed) {
          macros.push({
            index: i,
            name: macro.name || `Macro ${i + 1}`,
            isUsed: macro.isUsed,
            hasUnsupportedOps: macro.hasUnsupportedOps || false,
          });
        }
      });
    }

    const macroPlayer: AtemMacroPlayerState = {
      isRunning: state?.macro?.macroPlayer?.isRunning ?? false,
      isWaiting: state?.macro?.macroPlayer?.isWaiting ?? false,
      loop: state?.macro?.macroPlayer?.loop ?? false,
      macroIndex: state?.macro?.macroPlayer?.macroIndex ?? 0,
    };

    const auxOutputs: number[] = [];
    if (state?.video?.auxilliaries) {
      state.video.auxilliaries.forEach((aux) => {
        auxOutputs.push(aux ?? 0);
      });
    }

    return {
      connected: this.connected,
      programInput: mixEffect?.programInput ?? 0,
      previewInput: mixEffect?.previewInput ?? 0,
      inTransition: mixEffect?.transitionPosition?.inTransition ?? false,
      transitionPosition: mixEffect?.transitionPosition?.handlePosition ?? 0,
      inputs: inputs.filter(i => i.inputId >= 1 && i.inputId <= 20),
      transition,
      fadeToBlack,
      downstreamKeyers,
      upstreamKeyers,
      macroPlayer,
      macros,
      auxOutputs,
    };
  }

  async setProgramInput(inputId: number): Promise<void> {
    if (!this.connected) return;
    await this.atem?.changeProgramInput(inputId);
  }

  async setPreviewInput(inputId: number): Promise<void> {
    if (!this.connected) return;
    await this.atem?.changePreviewInput(inputId);
  }

  async cut(): Promise<void> {
    if (!this.connected) return;
    await this.atem?.cut();
  }

  async autoTransition(): Promise<void> {
    if (!this.connected) return;
    await this.atem?.autoTransition();
  }

  async fadeToBlack(): Promise<void> {
    if (!this.connected) return;
    await this.atem?.fadeToBlack();
  }

  async setTransitionPosition(position: number): Promise<void> {
    if (!this.connected) return;
    await this.atem?.setTransitionPosition(position);
  }

  async setTransitionStyle(style: number): Promise<void> {
    if (!this.connected) return;
    await this.atem?.setTransitionStyle({ nextStyle: style });
  }

  async setTransitionPreview(enabled: boolean): Promise<void> {
    if (!this.connected) return;
    await this.atem?.previewTransition(enabled);
  }

  async setMixRate(rate: number): Promise<void> {
    if (!this.connected) return;
    await this.atem?.setMixTransitionSettings({ rate });
  }

  async setDipRate(rate: number): Promise<void> {
    if (!this.connected) return;
    await this.atem?.setDipTransitionSettings({ rate });
  }

  async setWipeRate(rate: number): Promise<void> {
    if (!this.connected) return;
    await this.atem?.setWipeTransitionSettings({ rate });
  }

  async setFadeToBlackRate(rate: number): Promise<void> {
    if (!this.connected) return;
    await this.atem?.setFadeToBlackRate(rate);
  }

  async setDSKOnAir(dskIndex: number, onAir: boolean): Promise<void> {
    if (!this.connected) return;
    await this.atem?.setDownstreamKeyOnAir(onAir, dskIndex);
  }

  async setDSKTie(dskIndex: number, tie: boolean): Promise<void> {
    if (!this.connected) return;
    await this.atem?.setDownstreamKeyTie(tie, dskIndex);
  }

  async autoDSK(dskIndex: number): Promise<void> {
    if (!this.connected) return;
    await this.atem?.autoDownstreamKey(dskIndex);
  }

  async setDSKRate(dskIndex: number, rate: number): Promise<void> {
    if (!this.connected) return;
    await this.atem?.setDownstreamKeyRate(rate, dskIndex);
  }

  async setUSKOnAir(uskIndex: number, onAir: boolean): Promise<void> {
    if (!this.connected) return;
    await this.atem?.setUpstreamKeyerOnAir(onAir, 0, uskIndex);
  }

  async runMacro(macroIndex: number): Promise<void> {
    if (!this.connected) return;
    await this.atem?.macroRun(macroIndex);
  }

  async stopMacro(): Promise<void> {
    if (!this.connected) return;
    await this.atem?.macroStop();
  }

  async continueMacro(): Promise<void> {
    if (!this.connected) return;
    await this.atem?.macroContinue();
  }

  async setAuxSource(auxIndex: number, sourceId: number): Promise<void> {
    if (!this.connected) return;
    await this.atem?.setAuxSource(sourceId, auxIndex);
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
