export const DEVICE_SETUP_TYPES = ["camera", "mixer", "switcher", "obs", "hue", "display"] as const;

export type DeviceSetupType = typeof DEVICE_SETUP_TYPES[number];
export type DeviceSetupStep = "type" | "mode" | "details" | "testing" | "finish";
export type DeviceSetupDiscoveryOption = "visca" | "samsung" | "hisense";
export type DeviceSetupFinishStatus = "success" | "warning" | "failed";

export interface DeviceSetupConfig {
  type: DeviceSetupType;
  label: string;
  statusHint: string;
  route: string;
  discoveryOptions: readonly DeviceSetupDiscoveryOption[];
}

export interface BuildSetupFinishInput {
  type: DeviceSetupType;
  name: string;
  created: boolean;
  createdMessage?: string | null;
  testOk?: boolean | null;
  testMessage?: string | null;
  details?: Record<string, unknown>;
}

export interface DeviceSetupFinish {
  type: DeviceSetupType;
  name: string;
  created: boolean;
  status: DeviceSetupFinishStatus;
  warning: string | null;
  summary: {
    device: string;
    created: string;
    connection: string;
  };
  details: Record<string, unknown>;
}

const DEVICE_SETUP_CONFIGS: Record<DeviceSetupType, DeviceSetupConfig> = {
  camera: {
    type: "camera",
    label: "Camera",
    statusHint: "VISCA over IP",
    route: "/",
    discoveryOptions: ["visca"],
  },
  mixer: {
    type: "mixer",
    label: "Mixer",
    statusHint: "Behringer X32",
    route: "/mixer",
    discoveryOptions: [],
  },
  switcher: {
    type: "switcher",
    label: "ATEM Switcher",
    statusHint: "ATEM network control",
    route: "/switcher",
    discoveryOptions: [],
  },
  obs: {
    type: "obs",
    label: "OBS",
    statusHint: "OBS WebSocket",
    route: "/",
    discoveryOptions: [],
  },
  hue: {
    type: "hue",
    label: "Hue Bridge",
    statusHint: "Hue local bridge",
    route: "/lighting",
    discoveryOptions: [],
  },
  display: {
    type: "display",
    label: "Display",
    statusHint: "Samsung or Hisense local control",
    route: "/displays",
    discoveryOptions: ["samsung", "hisense"],
  },
};

const SENSITIVE_FIELD_RE = /(password|token|secret|apikey|api_key|key)$/i;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function getDeviceSetupConfig(type: DeviceSetupType) {
  return DEVICE_SETUP_CONFIGS[type];
}

export function getSetupDiscoveryOptions(type: DeviceSetupType) {
  return DEVICE_SETUP_CONFIGS[type].discoveryOptions;
}

export function deviceSetupSupportsDiscovery(type: DeviceSetupType) {
  return getSetupDiscoveryOptions(type).length > 0;
}

export function getInitialDeviceSetupStep(type?: DeviceSetupType | null): DeviceSetupStep {
  if (!type) return "type";
  return deviceSetupSupportsDiscovery(type) ? "mode" : "details";
}

export function redactSensitiveSetupFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveSetupFields(item));
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const redacted: Record<string, unknown> = {};
  for (const [key, fieldValue] of Object.entries(value)) {
    redacted[key] = SENSITIVE_FIELD_RE.test(key) ? "[redacted]" : redactSensitiveSetupFields(fieldValue);
  }
  return redacted;
}

export function buildSetupFinish(input: BuildSetupFinishInput): DeviceSetupFinish {
  const testMessage = input.testMessage?.trim() || null;
  const createdMessage = input.createdMessage?.trim() || null;
  const warning = input.created && input.testOk === false ? testMessage || "Device was saved, but the verification step failed." : null;
  const status: DeviceSetupFinishStatus = input.created
    ? warning ? "warning" : "success"
    : "failed";

  return {
    type: input.type,
    name: input.name,
    created: input.created,
    status,
    warning,
    summary: {
      device: input.name,
      created: input.created ? createdMessage || "Device saved" : createdMessage || "Device was not saved",
      connection: input.testOk === false ? testMessage || "Verification failed" : testMessage || "Verification complete",
    },
    details: redactSensitiveSetupFields(input.details ?? {}) as Record<string, unknown>,
  };
}
