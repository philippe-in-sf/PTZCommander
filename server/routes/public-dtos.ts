import type { Camera, HueBridge, Layout, ObsConnection } from "@shared/schema";

export const REDACTED_SECRET = "********";

export type PublicCamera = Omit<Camera, "password"> & { password: typeof REDACTED_SECRET | null };
export type PublicHueBridge = Omit<HueBridge, "apiKey"> & { apiKey: typeof REDACTED_SECRET | null };
export type PublicObsConnection = Omit<ObsConnection, "password"> & { password: typeof REDACTED_SECRET | null };
export type PublicLayout = Layout;

export function isRedactedSecret(value: unknown) {
  return value === REDACTED_SECRET;
}

export function publicCamera<T extends Camera>(camera: T): PublicCamera {
  return {
    ...camera,
    password: camera.password ? REDACTED_SECRET : null,
  };
}

export function publicHueBridge<T extends HueBridge>(bridge: T): PublicHueBridge {
  return {
    ...bridge,
    apiKey: bridge.apiKey ? REDACTED_SECRET : null,
  };
}

export function publicObsConnection<T extends ObsConnection>(connection: T): PublicObsConnection {
  return {
    ...connection,
    password: connection.password ? REDACTED_SECRET : null,
  };
}

export function redactLayoutSnapshot(snapshot: string) {
  try {
    const parsed = JSON.parse(snapshot);
    if (Array.isArray(parsed.cameras)) {
      parsed.cameras = parsed.cameras.map((camera: Record<string, unknown>) => ({
        ...camera,
        password: camera.password ? REDACTED_SECRET : null,
      }));
    }
    if (Array.isArray(parsed.obsConnections)) {
      parsed.obsConnections = parsed.obsConnections.map((connection: Record<string, unknown>) => ({
        ...connection,
        password: connection.password ? REDACTED_SECRET : null,
      }));
    }
    if (Array.isArray(parsed.hueBridges)) {
      parsed.hueBridges = parsed.hueBridges.map((bridge: Record<string, unknown>) => ({
        ...bridge,
        apiKey: bridge.apiKey ? REDACTED_SECRET : null,
      }));
    }
    return JSON.stringify(parsed);
  } catch {
    return JSON.stringify({});
  }
}

export function publicLayout<T extends Layout>(layout: T): PublicLayout {
  return {
    ...layout,
    snapshot: redactLayoutSnapshot(layout.snapshot),
  };
}
