import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { VISCAClient } from "../server/visca";

test("VISCA client accepts an open TCP control socket that does not answer inquiry", async () => {
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.equal(typeof address, "object");
  assert.notEqual(address, null);

  const client = new VISCAClient("127.0.0.1", address.port);
  try {
    const connected = await client.connect();
    assert.equal(connected, true);
    assert.equal(client.isConnected(), true);
  } finally {
    client.disconnect();
    for (const socket of sockets) {
      socket.destroy();
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
