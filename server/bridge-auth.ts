import { timingSafeEqual } from "crypto";

function safeEqualString(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function bearerTokenFromHeader(header: unknown) {
  if (typeof header !== "string") return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function getConfiguredBridgeAuthToken(env: NodeJS.ProcessEnv = process.env) {
  return env.BRIDGE_AUTH_TOKEN || env.PTZ_BRIDGE_AUTH_TOKEN || "";
}

/** True only when Authorization carries the configured bridge bearer token. */
export function isValidBridgeAuthorization(authorizationHeader: unknown, env: NodeJS.ProcessEnv = process.env) {
  const token = bearerTokenFromHeader(authorizationHeader);
  const expected = getConfiguredBridgeAuthToken(env);
  if (!token || !expected) return false;
  return safeEqualString(token, expected);
}
