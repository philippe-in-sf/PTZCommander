export const REDACTED_DIAGNOSTIC_VALUE = "redacted";

export interface DiagnosticsLogEntry {
  timestamp?: string | number | Date;
  level?: string;
  category?: string;
  message?: string;
  details?: unknown;
  action?: string;
  userId?: string;
}

export interface DiagnosticsHealthDevice {
  type: string;
  id: number;
  name: string;
  ip: string;
  port?: number;
  status?: string;
}

export interface DiagnosticsHealthSnapshot {
  cameras: DiagnosticsHealthDevice[];
  mixers: DiagnosticsHealthDevice[];
  switchers: DiagnosticsHealthDevice[];
  displays: DiagnosticsHealthDevice[];
  timestamp: number;
}

export interface DiagnosticsHueBridge {
  id: number;
  name: string;
  ip: string;
  status?: string;
  apiKey?: string | null;
}

export interface DiagnosticsSummaryInput {
  health?: DiagnosticsHealthSnapshot | null;
  hueBridges?: DiagnosticsHueBridge[] | null;
  recentLogs?: DiagnosticsLogEntry[] | null;
}

export interface DiagnosticsSummary {
  offlineDevices: number;
  offlineHueBridges: number;
  warnings: number;
  errors: number;
  lastProblem: null | {
    timestamp?: string | number | Date;
    level?: string;
    category?: string;
    message?: string;
  };
}

const SENSITIVE_KEY_PATTERN = /^(password|apikey|api_key|token|secret|access_token|accessToken|refresh_token|refreshToken|authorization)$/i;
const URL_CREDENTIAL_PATTERN = /([a-z][a-z0-9+.-]*:\/\/)([^:@/\s]+):([^@/\s]+)@/gi;

function redactUrlCredentials(value: string) {
  return value.replace(URL_CREDENTIAL_PATTERN, "$1redacted:redacted@");
}

export function redactDiagnosticsValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") return redactUrlCredentials(value);
  if (value === null || value === undefined) return value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => redactDiagnosticsValue(item, seen));
  if (typeof value === "object") {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);

    const output: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      output[key] = SENSITIVE_KEY_PATTERN.test(key)
        ? REDACTED_DIAGNOSTIC_VALUE
        : redactDiagnosticsValue(nestedValue, seen);
    }
    return output;
  }
  return String(value);
}

function allHealthDevices(health?: DiagnosticsHealthSnapshot | null) {
  return [
    ...(health?.cameras ?? []),
    ...(health?.mixers ?? []),
    ...(health?.switchers ?? []),
    ...(health?.displays ?? []),
  ];
}

function isWarningLog(log: DiagnosticsLogEntry) {
  return String(log.level ?? "").toLowerCase() === "warn";
}

function isErrorLog(log: DiagnosticsLogEntry) {
  return String(log.level ?? "").toLowerCase() === "error";
}

export function summarizeDiagnostics(input: DiagnosticsSummaryInput): DiagnosticsSummary {
  const recentLogs = input.recentLogs ?? [];
  const problemLogs = recentLogs.filter((log) => isWarningLog(log) || isErrorLog(log));
  const lastProblem = problemLogs.length > 0 ? problemLogs[problemLogs.length - 1] : null;

  return {
    offlineDevices: allHealthDevices(input.health).filter((device) => device.status !== "online").length,
    offlineHueBridges: (input.hueBridges ?? []).filter((bridge) => bridge.status !== "online").length,
    warnings: recentLogs.filter(isWarningLog).length,
    errors: recentLogs.filter(isErrorLog).length,
    lastProblem: lastProblem
      ? {
          timestamp: lastProblem.timestamp,
          level: lastProblem.level,
          category: lastProblem.category,
          message: lastProblem.message,
        }
      : null,
  };
}
