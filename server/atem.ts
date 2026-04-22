import dgram from "node:dgram";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { errorDetails, logger } from "./logger";

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
type AtemConstructor = new (options?: { disableMultithreaded?: boolean }) => AtemInstance;
type AtemSocketChildModule = {
  ConnectionState: { Established: number };
  AtemSocketChild: {
    prototype: {
      _socket?: dgram.Socket;
      _connectionState: number;
      _receivePacket(packet: Buffer, rinfo: dgram.RemoteInfo): void;
      log(message: string): void;
      restartConnection(): Promise<void>;
      _createSocket(): dgram.Socket;
    };
  };
};

let atemConstructorPromise: Promise<AtemConstructor> | null = null;
let atemSocketPatchApplied = false;
let atemPreferredLocalAddress: string | null = null;
const ATEM_CONNECT_TIMEOUT_MS = 10000;
const ATEM_MODULE_RETRY_COUNT = 5;

function ipv4ToInt(ip: string) {
  return ip.split(".").reduce((acc, part) => ((acc << 8) + Number(part)) >>> 0, 0);
}

function maskToPrefix(mask: string) {
  return mask
    .split(".")
    .map((part) => Number(part).toString(2).padStart(8, "0"))
    .join("")
    .replace(/0+$/, "").length;
}

function isSameSubnet(ip: string, candidateAddress: string, netmask: string) {
  const prefix = maskToPrefix(netmask);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(candidateAddress) & mask);
}

function scoreLocalInterface(name: string) {
  let score = 0;

  if (/^(utun|awdl|llw|bridge|lo)/.test(name)) return -100;
  if (/^(en|eth)\d+$/.test(name)) score += 10;
  if (/^en1$/.test(name)) score -= 15;

  try {
    const details = execFileSync("ifconfig", [name], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    if (/media: .*baseT/i.test(details)) score += 50;
    if (/status: active/i.test(details)) score += 5;
    if (/media: autoselect(?!.*baseT)/i.test(details)) score -= 5;
  } catch {
    // Ignore local inspection failures; we'll fall back to interface name scoring.
  }

  return score;
}

function selectPreferredAtemLocalAddress(targetIp: string) {
  const candidates = Object.entries(os.networkInterfaces())
    .flatMap(([name, entries]) =>
      (entries || [])
        .filter((entry) => entry.family === "IPv4" && !entry.internal && entry.netmask && isSameSubnet(targetIp, entry.address, entry.netmask))
        .map((entry) => ({ interfaceName: name, address: entry.address, netmask: entry.netmask, score: scoreLocalInterface(name) })),
    )
    .sort((a, b) => b.score - a.score || a.interfaceName.localeCompare(b.interfaceName));

  const selected = candidates[0] ?? null;
  logger.debug("switcher", "Resolved ATEM local interface candidates", {
    action: "atem_local_interface_candidates",
    details: {
      targetIp,
      selected: selected ? { interfaceName: selected.interfaceName, address: selected.address, score: selected.score } : null,
      candidates,
    },
  });
  return selected;
}

function patchAtemSocketBinding() {
  if (atemSocketPatchApplied) return;

  const childModule = require("atem-connection/dist/lib/atemSocketChild") as AtemSocketChildModule;
  childModule.AtemSocketChild.prototype._createSocket = function createSocketWithPreferredBind(this: AtemSocketChildModule["AtemSocketChild"]["prototype"]) {
    this._socket = dgram.createSocket("udp4");
    if (atemPreferredLocalAddress) {
      this._socket.bind({ address: atemPreferredLocalAddress, port: 0 });
    } else {
      this._socket.bind();
    }
    this._socket.on("message", (packet, rinfo) => this._receivePacket(packet, rinfo));
    this._socket.on("error", (err) => {
      this.log(`Connection error: ${err}`);
      if (this._connectionState === childModule.ConnectionState.Established) {
        this.restartConnection().catch((error) => {
          this.log(`Failed to restartConnection: ${error instanceof Error ? error.message : String(error)}`);
        });
      }
    });
    return this._socket;
  };

  atemSocketPatchApplied = true;
}

function isRetryableAtemLoadError(error: unknown) {
  return Boolean(
    error &&
    typeof error === "object" &&
    ("errno" in error || "code" in error) &&
    ((error as NodeJS.ErrnoException).errno === -11 || (error as NodeJS.ErrnoException).code === "EAGAIN"),
  );
}

async function wait(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function clearAtemModuleCache() {
  for (const cacheKey of Object.keys(require.cache)) {
    if (cacheKey.includes(`${require("path").sep}atem-connection${require("path").sep}`)) {
      delete require.cache[cacheKey];
    }
  }
}

async function loadAtemConstructor(): Promise<AtemConstructor> {
  if (!atemConstructorPromise) {
    logger.debug("switcher", "Loading ATEM connection module", {
      action: "atem_module_load",
      details: { nodeVersion: process.version, platform: process.platform, pid: process.pid },
    });
    atemConstructorPromise = (async () => {
      let lastError: unknown;

      for (let attempt = 1; attempt <= ATEM_MODULE_RETRY_COUNT; attempt += 1) {
        try {
          patchAtemSocketBinding();
          const module = require("atem-connection") as typeof import("atem-connection");
          const Atem = module.Atem ?? (module as { default?: { Atem?: AtemConstructor } }).default?.Atem ?? (module as { default?: AtemConstructor }).default ?? module.BasicAtem;
          if (typeof Atem !== "function") {
            throw new TypeError(`atem-connection did not expose a constructor (exports: ${Object.keys(module).slice(0, 12).join(", ")})`);
          }
          logger.debug("switcher", "ATEM connection module loaded", {
            action: "atem_module_loaded",
            details: { exports: Object.keys(module).slice(0, 12), attempts: attempt, constructor: Atem.name || "anonymous" },
          });
          return Atem as AtemConstructor;
        } catch (error) {
          lastError = error;
          if (!isRetryableAtemLoadError(error) || attempt === ATEM_MODULE_RETRY_COUNT) {
            break;
          }

          logger.warn("switcher", `ATEM module load hit a transient read error; retrying (${attempt}/${ATEM_MODULE_RETRY_COUNT})`, {
            action: "atem_module_load_retry",
            details: { attempt, ...errorDetails(error) },
          });

          clearAtemModuleCache();

          await wait(50 * attempt);
        }
      }

      atemConstructorPromise = null;
      logger.error("switcher", "Failed to load ATEM connection module", {
        action: "atem_module_load_error",
        details: errorDetails(lastError),
      });
      throw lastError;
    })();
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

    const preferredLocalInterface = selectPreferredAtemLocalAddress(this.config.ip);
    atemPreferredLocalAddress = preferredLocalInterface?.address ?? null;

    const Atem = await loadAtemConstructor();
    const atem = new Atem({
      // Avoid the threaded socket worker under launchd/Node 24. That worker can
      // fail while reading its child module and prevent ATEM connections.
      disableMultithreaded: true,
    });
    logger.debug("switcher", "ATEM client instance created", {
      action: "atem_client_created",
      details: {
        ip: this.config.ip,
        disableMultithreaded: true,
        timeoutMs: ATEM_CONNECT_TIMEOUT_MS,
        localAddress: atemPreferredLocalAddress,
        localInterface: preferredLocalInterface?.interfaceName ?? null,
      },
    });

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
      logger.error("switcher", `ATEM error: ${message}`, {
        action: "atem_error",
        details: error instanceof Error ? errorDetails(error) : { error: message },
      });
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
    const startedAt = Date.now();
    try {
      const atem = await this.getAtem();
      logger.info("switcher", `Connecting to ATEM at ${this.config.ip}`, {
        action: "atem_connect_start",
        details: { ip: this.config.ip, timeoutMs: ATEM_CONNECT_TIMEOUT_MS },
      });

      if (this.connected) {
        logger.debug("switcher", `ATEM already connected at ${this.config.ip}`, {
          action: "atem_connect_already_connected",
          details: { ip: this.config.ip },
        });
        return true;
      }

      const connected = await new Promise<boolean>((resolve) => {
        let settled = false;
        const cleanup = () => {
          clearTimeout(timer);
          atem.off?.("connected", onConnected);
          atem.off?.("disconnected", onDisconnected);
          atem.off?.("error", onError);
        };
        const finish = (success: boolean) => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(success);
        };
        const onConnected = () => finish(true);
        const onDisconnected = () => finish(false);
        const onError = (error: unknown) => {
          logger.error("switcher", "ATEM emitted an error during connection", {
            action: "atem_connect_event_error",
            details: errorDetails(error),
          });
          finish(false);
        };
        const timer = setTimeout(() => {
          logger.warn("switcher", `ATEM connection timed out after ${ATEM_CONNECT_TIMEOUT_MS}ms`, {
            action: "atem_connect_timeout",
            details: { ip: this.config.ip, elapsedMs: Date.now() - startedAt },
          });
          finish(false);
        }, ATEM_CONNECT_TIMEOUT_MS);

        atem.once?.("connected", onConnected);
        atem.once?.("disconnected", onDisconnected);
        atem.once?.("error", onError);

        atem.connect(this.config.ip).catch((error: unknown) => {
          logger.error("switcher", "ATEM connect call rejected", {
            action: "atem_connect_rejected",
            details: errorDetails(error),
          });
          finish(false);
        });
      });

      if (!connected) {
        await this.resetAtem("connect_failed");
      } else {
        logger.info("switcher", `ATEM connection ready at ${this.config.ip}`, {
          action: "atem_connect_ready",
          details: { ip: this.config.ip, elapsedMs: Date.now() - startedAt },
        });
      }

      return connected;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("switcher", `ATEM connection error: ${message}`, {
        action: "atem_connect_error",
        details: { ...errorDetails(error), ip: this.config.ip, elapsedMs: Date.now() - startedAt },
      });
      await this.resetAtem("connect_exception");
      return false;
    }
  }

  disconnect() {
    this.atem?.disconnect();
    this.connected = false;
  }

  private async resetAtem(reason: string) {
    const atem = this.atem;
    this.atem = null;
    this.connected = false;
    if (!atem) return;
    try {
      let cleanupMethod = "none";
      const cleanup = async () => {
        if (typeof atem.destroy === "function") {
          cleanupMethod = "destroy";
          await atem.destroy();
        } else if (typeof atem.disconnect === "function") {
          cleanupMethod = "disconnect";
          await atem.disconnect();
        }
      };
      const cleanupTimeout = new Promise<"timeout">((resolve) => {
        setTimeout(() => resolve("timeout"), 1500);
      });
      const result = await Promise.race([cleanup().then(() => "complete" as const), cleanupTimeout]);
      if (result === "timeout") {
        logger.warn("switcher", "ATEM client cleanup timed out", {
          action: "atem_client_cleanup_timeout",
          details: { reason, ip: this.config.ip, cleanupMethod },
        });
        return;
      }
      logger.debug("switcher", "ATEM client cleaned up", {
        action: "atem_client_cleanup",
        details: { reason, ip: this.config.ip, cleanupMethod },
      });
    } catch (error) {
      logger.warn("switcher", "ATEM client cleanup failed", {
        action: "atem_client_cleanup_error",
        details: { reason, ip: this.config.ip, ...errorDetails(error) },
      });
    }
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
