export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogCategory = 
  | "api" 
  | "websocket" 
  | "camera" 
  | "mixer" 
  | "switcher" 
  | "database" 
  | "system";

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  category: LogCategory;
  message: string;
  details?: Record<string, any>;
  userId?: string;
  action?: string;
}

type LogCallback = (entry: LogEntry) => void;

function toJsonSafe(value: unknown, depth = 0): unknown {
  if (depth > 3) return "[MaxDepth]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((item) => toJsonSafe(item, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.getOwnPropertyNames(value)) {
      try {
        out[key] = toJsonSafe((value as Record<string, unknown>)[key], depth + 1);
      } catch {
        out[key] = "[Unreadable]";
      }
    }
    return out;
  }
  return String(value);
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(toJsonSafe(value));
  } catch (error) {
    return JSON.stringify({ loggingError: errorDetails(error) });
  }
}

export function errorDetails(error: unknown): Record<string, any> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...Object.fromEntries(
        Object.getOwnPropertyNames(error)
          .filter((key) => !["name", "message", "stack", "cause"].includes(key))
          .map((key) => [key, toJsonSafe((error as any)[key])])
      ),
      ...(error.cause ? { cause: errorDetails(error.cause) } : {}),
    };
  }
  return { value: toJsonSafe(error) };
}

class Logger {
  private logCallbacks: Set<LogCallback> = new Set();
  private logBuffer: LogEntry[] = [];
  private maxBufferSize = 1000;

  private formatTimestamp(date: Date): string {
    return date.toISOString();
  }

  private formatLogLine(entry: LogEntry): string {
    const timestamp = this.formatTimestamp(entry.timestamp);
    const level = entry.level.toUpperCase().padEnd(5);
    const category = `[${entry.category}]`.padEnd(12);
    const action = entry.action ? ` action=${entry.action}` : "";
    const details = entry.details ? ` ${safeStringify(entry.details)}` : "";
    return `${timestamp} ${level} ${category} ${entry.message}${action}${details}`;
  }

  private log(level: LogLevel, category: LogCategory, message: string, options?: {
    details?: Record<string, any>;
    userId?: string;
    action?: string;
  }): void {
    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      category,
      message,
      details: options?.details,
      userId: options?.userId,
      action: options?.action,
    };

    this.logBuffer.push(entry);
    if (this.logBuffer.length > this.maxBufferSize) {
      this.logBuffer.shift();
    }

    const formattedLine = this.formatLogLine(entry);
    
    switch (level) {
      case "debug":
        console.debug(formattedLine);
        break;
      case "info":
        console.log(formattedLine);
        break;
      case "warn":
        console.warn(formattedLine);
        break;
      case "error":
        console.error(formattedLine);
        break;
    }

    this.logCallbacks.forEach(callback => callback(entry));
  }

  debug(category: LogCategory, message: string, options?: { details?: Record<string, any>; userId?: string; action?: string }): void {
    this.log("debug", category, message, options);
  }

  info(category: LogCategory, message: string, options?: { details?: Record<string, any>; userId?: string; action?: string }): void {
    this.log("info", category, message, options);
  }

  warn(category: LogCategory, message: string, options?: { details?: Record<string, any>; userId?: string; action?: string }): void {
    this.log("warn", category, message, options);
  }

  error(category: LogCategory, message: string, options?: { details?: Record<string, any>; userId?: string; action?: string }): void {
    this.log("error", category, message, options);
  }

  getRecentLogs(count: number = 100, filter?: { level?: LogLevel; category?: LogCategory }): LogEntry[] {
    let logs = [...this.logBuffer];
    
    if (filter?.level) {
      logs = logs.filter(log => log.level === filter.level);
    }
    if (filter?.category) {
      logs = logs.filter(log => log.category === filter.category);
    }
    
    return logs.slice(-count);
  }

  addCallback(callback: LogCallback): void {
    this.logCallbacks.add(callback);
  }

  removeCallback(callback: LogCallback): void {
    this.logCallbacks.delete(callback);
  }

  api(method: string, path: string, statusCode: number, durationMs: number, options?: { userId?: string; details?: Record<string, any> }): void {
    const level = statusCode >= 500 ? "error" : statusCode >= 400 ? "warn" : "info";
    this.log(level, "api", `${method} ${path} ${statusCode} in ${durationMs}ms`, {
      action: `${method}:${path}`,
      details: { statusCode, durationMs, ...options?.details },
      userId: options?.userId,
    });
  }

  wsMessage(type: string, direction: "in" | "out", options?: { details?: Record<string, any> }): void {
    this.log("debug", "websocket", `${direction === "in" ? "Received" : "Sent"} ${type}`, {
      action: `ws:${type}`,
      details: options?.details,
    });
  }

  cameraAction(cameraId: number, action: string, options?: { details?: Record<string, any> }): void {
    this.log("info", "camera", `Camera ${cameraId}: ${action}`, {
      action: `camera:${action}`,
      details: { cameraId, ...options?.details },
    });
  }

  mixerAction(action: string, options?: { details?: Record<string, any> }): void {
    this.log("info", "mixer", `Mixer: ${action}`, {
      action: `mixer:${action}`,
      details: options?.details,
    });
  }

  switcherAction(action: string, options?: { details?: Record<string, any> }): void {
    this.log("info", "switcher", `Switcher: ${action}`, {
      action: `switcher:${action}`,
      details: options?.details,
    });
  }
}

export const logger = new Logger();

import { storage } from "./storage";

export function setupAuditLogging(): void {
  logger.addCallback(async (entry) => {
    if (entry.level === "info" || entry.level === "warn" || entry.level === "error") {
      try {
        await storage.createAuditLog({
          timestamp: entry.timestamp,
          level: entry.level,
          category: entry.category,
          message: entry.message,
          action: entry.action || null,
          details: entry.details ? JSON.stringify(entry.details) : null,
          userId: entry.userId || null,
        });
      } catch (error) {
        console.error("Failed to persist audit log:", error);
      }
    }
  });
}
