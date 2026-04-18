import { createHash, randomUUID } from "crypto";
import { WebSocket } from "ws";
import { logger } from "./logger";

const OBS_OP_HELLO = 0;
const OBS_OP_IDENTIFY = 1;
const OBS_OP_IDENTIFIED = 2;
const OBS_OP_EVENT = 5;
const OBS_OP_REQUEST = 6;
const OBS_OP_REQUEST_RESPONSE = 7;

export interface ObsScene {
  sceneName: string;
  sceneIndex?: number;
}

export interface ObsState {
  connected: boolean;
  host: string;
  port: number;
  currentProgramScene: string | null;
  currentPreviewScene: string | null;
  studioMode: boolean;
  scenes: ObsScene[];
  error?: string;
}

export interface ObsConfig {
  id: number;
  name: string;
  host: string;
  port: number;
  password?: string | null;
}

interface PendingRequest {
  requestType: string;
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

type StateCallback = (state: ObsState) => void;

function obsUrl(host: string, port: number) {
  if (/^wss?:\/\//i.test(host)) return host;
  return `ws://${host}:${port}`;
}

function obsAuth(password: string, salt: string, challenge: string) {
  const secret = createHash("sha256").update(password + salt).digest("base64");
  return createHash("sha256").update(secret + challenge).digest("base64");
}

export class ObsClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, PendingRequest>();
  private identified = false;
  private state: ObsState;

  constructor(private config: ObsConfig, private onState?: StateCallback) {
    this.state = {
      connected: false,
      host: config.host,
      port: config.port,
      currentProgramScene: null,
      currentPreviewScene: null,
      studioMode: false,
      scenes: [],
    };
  }

  isConnected() {
    return this.identified && this.ws?.readyState === WebSocket.OPEN;
  }

  getState() {
    return this.state;
  }

  private setState(patch: Partial<ObsState>) {
    this.state = { ...this.state, ...patch };
    this.onState?.(this.state);
  }

  async connect(timeoutMs = 5000): Promise<boolean> {
    this.disconnect();
    this.identified = false;

    return new Promise((resolve) => {
      let settled = false;
      const settle = (connected: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(connected);
      };

      const timeout = setTimeout(() => {
        this.setState({ connected: false, error: "Connection timed out" });
        this.disconnect();
        settle(false);
      }, timeoutMs);

      try {
        const ws = new WebSocket(obsUrl(this.config.host, this.config.port));
        this.ws = ws;

        ws.on("open", () => {
          logger.info("switcher", `OBS WebSocket opened to ${this.config.host}:${this.config.port}`, { action: "obs_socket_open", details: { host: this.config.host, port: this.config.port } });
        });

        ws.on("message", async (data) => {
          try {
            const message = JSON.parse(data.toString()) as { op: number; d?: any };
            await this.handleMessage(message, settle);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger.error("switcher", `OBS message error: ${message}`, { action: "obs_message_error" });
          }
        });

        ws.on("error", (error) => {
          const message = error instanceof Error ? error.message : String(error);
          logger.error("switcher", `OBS connection error: ${message}`, { action: "obs_error", details: { error: message } });
          this.setState({ connected: false, error: message });
          settle(false);
        });

        ws.on("close", () => {
          this.identified = false;
          this.rejectPending(new Error("OBS WebSocket disconnected"));
          this.setState({ connected: false });
          logger.info("switcher", "OBS WebSocket disconnected", { action: "obs_disconnected" });
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error("switcher", `OBS connection exception: ${message}`, { action: "obs_connect_exception" });
        this.setState({ connected: false, error: message });
        settle(false);
      }
    });
  }

  disconnect() {
    this.identified = false;
    this.rejectPending(new Error("OBS WebSocket disconnected"));
    if (this.ws) {
      this.ws.removeAllListeners();
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
    }
    this.setState({ connected: false });
  }

  async getScenes() {
    const data = await this.request("GetSceneList");
    const scenes = Array.isArray(data.scenes) ? data.scenes as ObsScene[] : [];
    this.setState({
      scenes,
      currentProgramScene: data.currentProgramSceneName ?? this.state.currentProgramScene,
      currentPreviewScene: data.currentPreviewSceneName ?? this.state.currentPreviewScene,
    });
    return scenes;
  }

  async refreshState() {
    const [sceneList, studioMode] = await Promise.all([
      this.request("GetSceneList"),
      this.request("GetStudioModeEnabled").catch(() => null),
    ]);
    this.setState({
      connected: true,
      scenes: Array.isArray(sceneList.scenes) ? sceneList.scenes : [],
      currentProgramScene: sceneList.currentProgramSceneName ?? null,
      currentPreviewScene: sceneList.currentPreviewSceneName ?? null,
      studioMode: Boolean(studioMode?.studioModeEnabled),
      error: undefined,
    });
    return this.state;
  }

  async setCurrentProgramScene(sceneName: string) {
    await this.request("SetCurrentProgramScene", { sceneName });
    this.setState({ currentProgramScene: sceneName });
  }

  async setCurrentPreviewScene(sceneName: string) {
    await this.request("SetCurrentPreviewScene", { sceneName });
    this.setState({ currentPreviewScene: sceneName });
  }

  private async handleMessage(message: { op: number; d?: any }, settleConnect: (connected: boolean) => void) {
    if (message.op === OBS_OP_HELLO) {
      const authentication = message.d?.authentication;
      const identify: Record<string, unknown> = {
        rpcVersion: Math.min(Number(message.d?.rpcVersion || 1), 1),
      };
      if (authentication) {
        if (!this.config.password) {
          this.setState({ connected: false, error: "OBS requires a WebSocket password" });
          this.ws?.close();
          settleConnect(false);
          return;
        }
        identify.authentication = obsAuth(this.config.password, authentication.salt, authentication.challenge);
      }
      this.send({ op: OBS_OP_IDENTIFY, d: identify });
      return;
    }

    if (message.op === OBS_OP_IDENTIFIED) {
      this.identified = true;
      this.setState({ connected: true, error: undefined });
      logger.info("switcher", `OBS connected to ${this.config.host}:${this.config.port}`, { action: "obs_connected", details: { host: this.config.host, port: this.config.port } });
      settleConnect(true);
      this.refreshState().catch((error) => {
        logger.warn("switcher", `OBS connected but state refresh failed: ${error instanceof Error ? error.message : String(error)}`, { action: "obs_refresh_failed" });
      });
      return;
    }

    if (message.op === OBS_OP_REQUEST_RESPONSE) {
      const requestId = message.d?.requestId;
      const pending = this.pending.get(requestId);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(requestId);
      const status = message.d?.requestStatus;
      if (status?.result) {
        pending.resolve(message.d?.responseData || {});
      } else {
        pending.reject(new Error(status?.comment || `${pending.requestType} failed`));
      }
      return;
    }

    if (message.op === OBS_OP_EVENT) {
      const eventType = message.d?.eventType;
      const eventData = message.d?.eventData || {};
      if (eventType === "CurrentProgramSceneChanged") {
        this.setState({ currentProgramScene: eventData.sceneName ?? this.state.currentProgramScene });
      } else if (eventType === "CurrentPreviewSceneChanged") {
        this.setState({ currentPreviewScene: eventData.sceneName ?? this.state.currentPreviewScene });
      } else if (eventType === "SceneListChanged") {
        await this.getScenes().catch(() => undefined);
      } else if (eventType === "StudioModeStateChanged") {
        this.setState({ studioMode: Boolean(eventData.studioModeEnabled) });
      }
    }
  }

  private request(requestType: string, requestData?: Record<string, unknown>, timeoutMs = 5000): Promise<any> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("OBS is not connected"));
    }

    const requestId = randomUUID();
    const payload = { op: OBS_OP_REQUEST, d: { requestType, requestId, requestData } };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`${requestType} timed out`));
      }, timeoutMs);
      this.pending.set(requestId, { requestType, resolve, reject, timer });
      this.send(payload);
    });
  }

  private send(payload: Record<string, unknown>) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(payload));
  }

  private rejectPending(error: Error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}

export class ObsManager {
  private client: ObsClient | null = null;
  private onState?: StateCallback;

  setStateChangeCallback(callback: StateCallback) {
    this.onState = callback;
  }

  async connect(config: ObsConfig) {
    this.disconnect();
    this.client = new ObsClient(config, this.onState);
    const connected = await this.client.connect();
    if (!connected) return false;
    return true;
  }

  disconnect() {
    if (this.client) {
      this.client.disconnect();
      this.client = null;
    }
  }

  getClient() {
    return this.client;
  }

  getState() {
    return this.client?.getState() || null;
  }

}

export const obsManager = new ObsManager();
