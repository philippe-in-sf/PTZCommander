import assert from "node:assert/strict";
import test from "node:test";
import { replaceMixerSection } from "../client/src/lib/mixer-state";
import { X32Client, type ChannelState } from "../server/x32";

test("replaceMixerSection removes stale values from only the updated section", () => {
  const previous = new Map([
    ["ch:1", { channel: 1, section: "ch", fader: 0.8, muted: false }],
    ["main:1", { channel: 1, section: "main", fader: 0.6, muted: false }],
  ]);
  const next = replaceMixerSection(previous, "ch", []);
  assert.equal(next.has("ch:1"), false);
  assert.equal(next.has("main:1"), true);
});

test("X32 disconnect clears cached channel state for tablet clients", () => {
  const client = new X32Client({ ip: "127.0.0.1", port: 10023 });
  const updates: Array<{ section: string; states: ChannelState[] }> = [];
  client.setStateChangeCallback((section, states) => updates.push({ section, states }));
  (client as unknown as { handleMessage(message: unknown): void }).handleMessage({
    address: "/ch/01/mix/fader",
    args: [{ value: 0.75 }],
  });
  assert.equal(client.getChannelStates()[0]?.fader, 0.75);

  client.disconnect();

  assert.deepEqual(client.getChannelStates(), []);
  assert.ok(updates.some((update) => update.section === "ch" && update.states.length === 0));
});
