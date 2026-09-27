export function replaceMixerSection<T extends { channel: number; section: string }>(
  previous: Map<string, T>,
  section: string,
  channels: T[],
) {
  const next = new Map(previous);
  for (const key of next.keys()) {
    if (key.startsWith(`${section}:`)) next.delete(key);
  }
  for (const channel of channels) {
    next.set(`${section}:${channel.channel}`, { ...channel, section });
  }
  return next;
}
