import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { mixerApi, sceneButtonApi } from "@/lib/api";
import type { PTZWebSocket } from "@/lib/websocket";
import type { SceneButton } from "@shared/schema";
import { toast } from "sonner";

export type MixerLiveChannel = {
  channel: number;
  section: string;
  fader: number;
  muted: boolean;
  name: string;
};

type MixerStatusResponse = {
  connected: boolean;
  channels: MixerLiveChannel[];
  sections?: Record<string, MixerLiveChannel[]>;
};

export type MixerStrip = MixerLiveChannel & {
  id: string;
  isMain: boolean;
  label: string;
  level: number;
  peak: boolean;
};

function mixerChannelKey(section: string, channel: number) {
  return `${section}:${channel}`;
}

export function useSkinMixerData(ws: PTZWebSocket, queryKeyPrefix: string) {
  const [mixerChannelsByKey, setMixerChannelsByKey] = useState<Map<string, MixerLiveChannel>>(new Map());
  const { data: mixers = [] } = useQuery({
    queryKey: ["mixers"],
    queryFn: mixerApi.getAll,
  });
  const mixer = mixers[0] ?? null;
  const { data: mixerStatus } = useQuery<MixerStatusResponse>({
    queryKey: [queryKeyPrefix, "mixer-status", mixer?.id],
    queryFn: () => mixerApi.getStatus(mixer!.id),
    enabled: !!mixer,
    refetchInterval: mixer?.status === "online" ? 5000 : false,
  });

  useEffect(() => {
    if (!mixer) {
      setMixerChannelsByKey(new Map());
    }
  }, [mixer]);

  useEffect(() => {
    if (!mixerStatus) return;

    setMixerChannelsByKey((prev) => {
      const next = new Map(prev);

      if (mixerStatus.sections) {
        for (const [section, channels] of Object.entries(mixerStatus.sections)) {
          channels.forEach((channel) => {
            next.set(mixerChannelKey(section, channel.channel), { ...channel, section });
          });
        }
      } else {
        mixerStatus.channels.forEach((channel) => {
          next.set(mixerChannelKey("ch", channel.channel), { ...channel, section: "ch" });
        });
      }

      return next;
    });
  }, [mixerStatus]);

  useEffect(() => {
    const handleMixerState = (message: Record<string, unknown>) => {
      if (
        (message.type === "mixer_state" || message.type === "mixer_section_state") &&
        Array.isArray(message.channels)
      ) {
        const section = typeof message.section === "string" ? message.section : "ch";
        setMixerChannelsByKey((prev) => {
          const next = new Map(prev);
          (message.channels as MixerLiveChannel[]).forEach((channel) => {
            next.set(mixerChannelKey(section, channel.channel), { ...channel, section });
          });
          return next;
        });
      }
    };

    ws.addMessageHandler(handleMixerState);
    return () => ws.removeMessageHandler(handleMixerState);
  }, [ws]);

  useEffect(() => {
    if (!mixer || mixer.status !== "online") return;
    ws.send({ type: "mixer_query_section", section: "ch" });
    ws.send({ type: "mixer_query_section", section: "main" });
  }, [mixer, ws]);

  const mixerStripData = useMemo<MixerStrip[]>(() => [
    mixerChannelsByKey.get("ch:1") ?? { channel: 1, section: "ch", fader: 0, muted: false, name: "Ch 1" },
    mixerChannelsByKey.get("ch:2") ?? { channel: 2, section: "ch", fader: 0, muted: false, name: "Ch 2" },
    mixerChannelsByKey.get("ch:3") ?? { channel: 3, section: "ch", fader: 0, muted: false, name: "Ch 3" },
    mixerChannelsByKey.get("main:1") ?? { channel: 1, section: "main", fader: 0, muted: false, name: "Main LR" },
  ].map((channel) => ({
    ...channel,
    id: channel.section === "main" ? "MAIN" : `CH${channel.channel}`,
    isMain: channel.section === "main",
    label: channel.section === "main" ? "MAIN" : `CH${channel.channel}`,
    level: Math.max(0, Math.min(100, Math.round((channel.fader ?? 0) * 100))),
    peak: !channel.muted && (channel.fader ?? 0) >= 0.9,
  })), [mixerChannelsByKey]);

  return { mixer, mixerStatus, mixerStripData };
}

export function useSkinSceneButtons(limit = 6) {
  const [activeSceneId, setActiveSceneId] = useState<number | null>(null);
  const { data: sceneButtons = [] } = useQuery<SceneButton[]>({
    queryKey: ["sceneButtons"],
    queryFn: sceneButtonApi.getAll,
  });

  const visibleSceneButtons = useMemo(
    () => [...sceneButtons].sort((a, b) => a.buttonNumber - b.buttonNumber).slice(0, limit),
    [limit, sceneButtons],
  );

  const executeMutation = useMutation({
    mutationFn: (id: number) => {
      setActiveSceneId(id);
      return sceneButtonApi.execute(id);
    },
    onSuccess: (data) => {
      toast.success("Scene executed", {
        description: data.results.join("\n"),
        duration: 5000,
      });
    },
    onError: (error: Error) => {
      toast.error("Scene failed", { description: error.message, duration: 5000 });
    },
  });

  return {
    sceneButtons: visibleSceneButtons,
    activeSceneId,
    executeScene: (id: number) => executeMutation.mutate(id),
    sceneExecuting: executeMutation.isPending,
  };
}
