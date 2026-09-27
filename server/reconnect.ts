export interface BackoffOptions {
  initialDelayMs?: number;
  maxDelayMs?: number;
  factor?: number;
  jitterMs?: number;
}

export class ExponentialBackoff {
  private attempts = 0;
  private readonly initialDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly factor: number;
  private readonly jitterMs: number;

  constructor(options: BackoffOptions = {}) {
    this.initialDelayMs = options.initialDelayMs ?? 1000;
    this.maxDelayMs = options.maxDelayMs ?? 30000;
    this.factor = options.factor ?? 2;
    this.jitterMs = options.jitterMs ?? 500;
  }

  reset() {
    this.attempts = 0;
  }

  nextDelayMs() {
    const baseDelay = Math.min(
      this.initialDelayMs * Math.pow(this.factor, this.attempts),
      this.maxDelayMs,
    );
    this.attempts += 1;
    return Math.round(baseDelay + Math.random() * this.jitterMs);
  }
}
