const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;

export class UnsafeCameraHttpUrlError extends Error {
  readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = "UnsafeCameraHttpUrlError";
  }
}

export function normalizeCameraHost(value: string) {
  return value.trim().toLowerCase().replace(/^\[|\]$/g, "");
}

export function isConfiguredCameraHttpTarget(
  value: string,
  camera: { ip: string },
) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    if (!url.hostname) return false;
    if (/[\u0000-\u001f\s]/.test(value)) return false;
    return normalizeCameraHost(url.hostname) === normalizeCameraHost(camera.ip);
  } catch {
    return false;
  }
}

export function assertSafeCameraHttpUrl(
  value: string,
  camera: { name: string; ip: string },
) {
  let url: URL;
  try {
    if (/[\u0000-\u001f\s]/.test(value)) {
      throw new UnsafeCameraHttpUrlError("Camera HTTP URL contains invalid characters");
    }
    url = new URL(value);
  } catch (error) {
    if (error instanceof UnsafeCameraHttpUrlError) throw error;
    throw new UnsafeCameraHttpUrlError("Camera HTTP URL is invalid");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeCameraHttpUrlError("Camera HTTP URLs must use http:// or https://");
  }

  if (!url.hostname) {
    throw new UnsafeCameraHttpUrlError("Camera HTTP URL is missing a host");
  }

  if (normalizeCameraHost(url.hostname) !== normalizeCameraHost(camera.ip)) {
    throw new UnsafeCameraHttpUrlError(
      `HTTP preview URL host must match the configured camera host for ${camera.name}`,
    );
  }

  return url;
}

export interface FetchCameraHttpOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  /** When true, 3xx responses are returned to the caller instead of rejected. Default rejects redirects. */
  allowRedirectResponse?: boolean;
}

export async function fetchCameraHttp(
  value: string,
  camera: { name: string; ip: string },
  options: FetchCameraHttpOptions = {},
) {
  assertSafeCameraHttpUrl(value, camera);
  const fetchImpl = options.fetchImpl || fetch;
  const response = await fetchImpl(value, {
    method: options.method || "GET",
    headers: options.headers,
    body: options.body,
    signal: options.signal,
    redirect: "manual",
  });

  if (
    !options.allowRedirectResponse
    && response.status >= 300
    && response.status < 400
  ) {
    throw new UnsafeCameraHttpUrlError("Camera HTTP preview redirects are not allowed");
  }

  return response;
}

export async function readResponseBytes(
  response: Response,
  maxBytes = DEFAULT_MAX_BYTES,
) {
  if (!response.body) {
    return Buffer.alloc(0);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      try {
        await reader.cancel();
      } catch {
        // Ignore cancel failures once the size limit is exceeded.
      }
      throw new UnsafeCameraHttpUrlError(`Camera HTTP response exceeded ${maxBytes} bytes`);
    }
    chunks.push(value);
  }

  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
}
