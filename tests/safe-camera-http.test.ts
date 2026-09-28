import assert from "node:assert/strict";
import test from "node:test";
import {
  assertSafeCameraHttpUrl,
  fetchCameraHttp,
  isConfiguredCameraHttpTarget,
  readResponseBytes,
  UnsafeCameraHttpUrlError,
} from "../server/safe-camera-http";

const camera = { name: "Cam 1", ip: "192.168.0.27" };

test("isConfiguredCameraHttpTarget requires matching camera host over http(s)", () => {
  assert.equal(isConfiguredCameraHttpTarget("http://192.168.0.27/snap.jpg", camera), true);
  assert.equal(isConfiguredCameraHttpTarget("https://192.168.0.27:8443/snap.jpg", camera), true);
  assert.equal(isConfiguredCameraHttpTarget("http://127.0.0.1/snap.jpg", camera), false);
  assert.equal(isConfiguredCameraHttpTarget("http://169.254.169.254/latest/meta-data", camera), false);
  assert.equal(isConfiguredCameraHttpTarget("rtsp://192.168.0.27/live", camera), false);
  assert.equal(isConfiguredCameraHttpTarget("http://192.168.0.27.evil.example/snap.jpg", camera), false);
});

test("assertSafeCameraHttpUrl rejects off-host and non-http URLs", () => {
  assert.equal(
    assertSafeCameraHttpUrl("http://192.168.0.27/cgi-bin/snapshot.cgi", camera).hostname,
    "192.168.0.27",
  );

  assert.throws(
    () => assertSafeCameraHttpUrl("http://10.0.0.1/admin", camera),
    (error: unknown) => error instanceof UnsafeCameraHttpUrlError
      && /must match the configured camera host/i.test(error.message),
  );

  assert.throws(
    () => assertSafeCameraHttpUrl("file:///etc/passwd", camera),
    (error: unknown) => error instanceof UnsafeCameraHttpUrlError,
  );
});

test("fetchCameraHttp rejects redirects and never calls fetch for unsafe hosts", async () => {
  let called = false;
  await assert.rejects(
    () => fetchCameraHttp("http://127.0.0.1/secret", camera, {
      fetchImpl: (async () => {
        called = true;
        return new Response("nope");
      }) as typeof fetch,
    }),
    (error: unknown) => error instanceof UnsafeCameraHttpUrlError,
  );
  assert.equal(called, false);

  await assert.rejects(
    () => fetchCameraHttp("http://192.168.0.27/snap.jpg", camera, {
      fetchImpl: (async () => new Response(null, {
        status: 302,
        headers: { Location: "http://127.0.0.1/steal" },
      })) as typeof fetch,
    }),
    (error: unknown) => error instanceof UnsafeCameraHttpUrlError
      && /redirects are not allowed/i.test((error as Error).message),
  );
});

test("readResponseBytes enforces a maximum body size", async () => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(100));
      controller.enqueue(new Uint8Array(100));
      controller.close();
    },
  });
  const response = new Response(stream);

  await assert.rejects(
    () => readResponseBytes(response, 150),
    (error: unknown) => error instanceof UnsafeCameraHttpUrlError
      && /exceeded 150 bytes/i.test((error as Error).message),
  );
});
