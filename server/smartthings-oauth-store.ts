export const SMARTTHINGS_OAUTH_TTL_MS = 15 * 60 * 1000;

export interface SmartThingsOAuthStartRecord {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope: string;
  userId: number;
  createdAt: number;
}

export interface SmartThingsOAuthSessionRecord {
  accessToken: string;
  refreshToken?: string;
  expiresAt: string;
  scope?: string;
  clientId: string;
  clientSecret: string;
  userId: number;
  createdAt: number;
}

export interface PublicSmartThingsOAuthSession {
  state: string;
  ready: true;
  clientId: string;
  expiresAt: string;
  scope?: string;
  hasRefreshToken: boolean;
}

export interface ConsumedSmartThingsOAuthCredentials {
  accessToken: string;
  refreshToken?: string;
  expiresAt: string;
  scope?: string;
  clientId: string;
  clientSecret: string;
}

type Clock = () => number;

export class SmartThingsOAuthStore {
  private readonly pending = new Map<string, SmartThingsOAuthStartRecord>();
  private readonly sessions = new Map<string, SmartThingsOAuthSessionRecord>();

  constructor(
    private readonly ttlMs = SMARTTHINGS_OAUTH_TTL_MS,
    private readonly now: Clock = () => Date.now(),
  ) {}

  clear() {
    this.pending.clear();
    this.sessions.clear();
  }

  private isExpired(createdAt: number) {
    return this.now() - createdAt > this.ttlMs;
  }

  private prune() {
    for (const [state, record] of this.pending) {
      if (this.isExpired(record.createdAt)) this.pending.delete(state);
    }
    for (const [state, record] of this.sessions) {
      if (this.isExpired(record.createdAt)) this.sessions.delete(state);
    }
  }

  start(state: string, record: Omit<SmartThingsOAuthStartRecord, "createdAt">) {
    this.prune();
    this.pending.set(state, { ...record, createdAt: this.now() });
  }

  takePending(state: string) {
    this.prune();
    const pending = this.pending.get(state);
    if (!pending) return null;
    this.pending.delete(state);
    return pending;
  }

  complete(state: string, record: Omit<SmartThingsOAuthSessionRecord, "createdAt">) {
    this.prune();
    this.sessions.set(state, { ...record, createdAt: this.now() });
  }

  getPublicSession(state: string, userId: number): PublicSmartThingsOAuthSession | null {
    this.prune();
    const session = this.sessions.get(state);
    if (!session) return null;
    if (session.userId !== userId) return null;
    return {
      state,
      ready: true,
      clientId: session.clientId,
      expiresAt: session.expiresAt,
      scope: session.scope,
      hasRefreshToken: Boolean(session.refreshToken),
    };
  }

  /** One-time consume of secrets for server-side discovery/create. */
  consume(state: string, userId: number): ConsumedSmartThingsOAuthCredentials | null {
    this.prune();
    const session = this.sessions.get(state);
    if (!session) return null;
    if (session.userId !== userId) return null;
    this.sessions.delete(state);
    return {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresAt: session.expiresAt,
      scope: session.scope,
      clientId: session.clientId,
      clientSecret: session.clientSecret,
    };
  }

  /** Peek access token for discovery without deleting the session. */
  getAccessToken(state: string, userId: number): string | null {
    this.prune();
    const session = this.sessions.get(state);
    if (!session || session.userId !== userId) return null;
    return session.accessToken;
  }
}

export const smartThingsOAuthStore = new SmartThingsOAuthStore();
