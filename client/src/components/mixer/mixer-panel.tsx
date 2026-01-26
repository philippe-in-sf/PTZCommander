import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { mixerApi } from "@/lib/api";
import { useWebSocket, type MixerChannelState } from "@/lib/websocket";
import { ChannelStrip } from "./channel-strip";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Volume2, VolumeX, Plus, Wifi, WifiOff, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Mixer } from "@shared/schema";

interface MixerPanelProps {
  collapsed?: boolean;
}

export function MixerPanel({ collapsed = false }: MixerPanelProps) {
  const queryClient = useQueryClient();
  const ws = useWebSocket();
  const [addMixerOpen, setAddMixerOpen] = useState(false);
  const [newMixer, setNewMixer] = useState({ name: "X32 Compact", ip: "", port: 10023 });
  const [mainFader, setMainFader] = useState(0.75);
  const [mainMuted, setMainMuted] = useState(false);

  const [channelStates, setChannelStates] = useState<Map<number, { fader: number; muted: boolean; name: string }>>(
    new Map(Array.from({ length: 16 }, (_, i) => [i + 1, { fader: 0.75, muted: false, name: `Ch ${i + 1}` }]))
  );

  const { data: mixers = [] } = useQuery({
    queryKey: ["mixers"],
    queryFn: mixerApi.getAll,
    refetchInterval: 5000,
  });

  const mixer = mixers[0];

  const handleMixerState = useCallback((message: any) => {
    if (message.type === "mixer_state" && Array.isArray(message.channels)) {
      setChannelStates(prev => {
        const newMap = new Map(prev);
        (message.channels as MixerChannelState[]).forEach((ch) => {
          newMap.set(ch.channel, {
            fader: ch.fader,
            muted: ch.muted,
            name: ch.name || `Ch ${ch.channel}`
          });
        });
        return newMap;
      });
    }
  }, []);

  useEffect(() => {
    if (ws) {
      ws.addMessageHandler(handleMixerState);
      return () => {
        ws.removeMessageHandler(handleMixerState);
      };
    }
  }, [ws, handleMixerState]);

  useEffect(() => {
    if (mixer && mixer.status === "online") {
      mixerApi.getStatus(mixer.id).then((status) => {
        if (status.channels && status.channels.length > 0) {
          setChannelStates(prev => {
            const newMap = new Map(prev);
            status.channels.forEach((ch: MixerChannelState) => {
              newMap.set(ch.channel, {
                fader: ch.fader,
                muted: ch.muted,
                name: ch.name || `Ch ${ch.channel}`
              });
            });
            return newMap;
          });
        }
      }).catch(console.error);
    }
  }, [mixer]);

  const createMixerMutation = useMutation({
    mutationFn: mixerApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mixers"] });
      setAddMixerOpen(false);
      setNewMixer({ name: "X32 Compact", ip: "", port: 10023 });
      toast.success("Mixer added successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const connectMixerMutation = useMutation({
    mutationFn: mixerApi.connect,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["mixers"] });
      if (data.success) {
        toast.success("Connected to mixer");
      } else {
        toast.error("Failed to connect to mixer");
      }
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const handleFaderChange = (channel: number, value: number) => {
    setChannelStates(prev => {
      const newMap = new Map(prev);
      const current = newMap.get(channel) || { fader: 0.75, muted: false, name: `Ch ${channel}` };
      newMap.set(channel, { ...current, fader: value });
      return newMap;
    });

    ws?.send({
      type: "mixer_fader",
      channel,
      value,
    });
  };

  const handleMuteToggle = (channel: number, muted: boolean) => {
    setChannelStates(prev => {
      const newMap = new Map(prev);
      const current = newMap.get(channel) || { fader: 0.75, muted: false, name: `Ch ${channel}` };
      newMap.set(channel, { ...current, muted });
      return newMap;
    });

    ws?.send({
      type: "mixer_mute",
      channel,
      muted,
    });
  };

  const handleMainFaderChange = (value: number[]) => {
    setMainFader(value[0]);
    ws?.send({
      type: "mixer_main_fader",
      value: value[0],
    });
  };

  const handleMainMuteToggle = () => {
    const newMuted = !mainMuted;
    setMainMuted(newMuted);
    ws?.send({
      type: "mixer_main_mute",
      muted: newMuted,
    });
  };

  if (collapsed) {
    return (
      <div className="bg-slate-900/80 border border-slate-700 rounded-lg p-3">
        <div className="flex items-center gap-2 text-slate-400">
          <SlidersHorizontal className="h-4 w-4" />
          <span className="text-sm">Mixer</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-900/80 border border-slate-700 rounded-lg p-4" data-testid="mixer-panel">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-5 w-5 text-cyan-400" />
          <h2 className="text-lg font-semibold text-white">Audio Mixer</h2>
        </div>

        {mixer ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400">{mixer.name}</span>
            {mixer.status === "online" ? (
              <Wifi className="h-4 w-4 text-green-500" />
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => connectMixerMutation.mutate(mixer.id)}
                className="text-slate-400 hover:text-white"
              >
                <WifiOff className="h-4 w-4 mr-1" />
                Connect
              </Button>
            )}
          </div>
        ) : (
          <Dialog open={addMixerOpen} onOpenChange={setAddMixerOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" data-testid="button-add-mixer">
                <Plus className="h-4 w-4 mr-1" />
                Add Mixer
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-slate-900 border-slate-700">
              <DialogHeader>
                <DialogTitle>Add X32 Mixer</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="mixer-name">Name</Label>
                  <Input
                    id="mixer-name"
                    value={newMixer.name}
                    onChange={(e) => setNewMixer({ ...newMixer, name: e.target.value })}
                    placeholder="X32 Compact"
                    className="bg-slate-800 border-slate-600"
                    data-testid="input-mixer-name"
                  />
                </div>
                <div>
                  <Label htmlFor="mixer-ip">IP Address</Label>
                  <Input
                    id="mixer-ip"
                    value={newMixer.ip}
                    onChange={(e) => setNewMixer({ ...newMixer, ip: e.target.value })}
                    placeholder="192.168.0.64"
                    className="bg-slate-800 border-slate-600"
                    data-testid="input-mixer-ip"
                  />
                </div>
                <div>
                  <Label htmlFor="mixer-port">Port</Label>
                  <Input
                    id="mixer-port"
                    type="number"
                    value={newMixer.port}
                    onChange={(e) => setNewMixer({ ...newMixer, port: parseInt(e.target.value) || 10023 })}
                    className="bg-slate-800 border-slate-600"
                    data-testid="input-mixer-port"
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={() => createMixerMutation.mutate(newMixer)}
                  disabled={!newMixer.ip || createMixerMutation.isPending}
                  data-testid="button-save-mixer"
                >
                  {createMixerMutation.isPending ? "Adding..." : "Add Mixer"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {!mixer ? (
        <div className="text-center py-8 text-slate-500">
          <SlidersHorizontal className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>No mixer configured</p>
          <p className="text-sm">Add your X32 to get started</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex gap-1 overflow-x-auto pb-2">
            {Array.from({ length: 16 }, (_, i) => i + 1).map((ch) => {
              const state = channelStates.get(ch) || { fader: 0.75, muted: false, name: `Ch ${ch}` };
              return (
                <ChannelStrip
                  key={ch}
                  channel={ch}
                  name={state.name}
                  fader={state.fader}
                  muted={state.muted}
                  onFaderChange={handleFaderChange}
                  onMuteToggle={handleMuteToggle}
                />
              );
            })}
          </div>

          <div className="flex items-center gap-4 p-3 bg-slate-800/50 rounded-lg border border-slate-600">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-cyan-400">MAIN</span>
              <Button
                variant={mainMuted ? "destructive" : "outline"}
                size="sm"
                onClick={handleMainMuteToggle}
                data-testid="mute-main"
              >
                {mainMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </Button>
            </div>
            <Slider
              value={[mainFader]}
              onValueChange={handleMainFaderChange}
              min={0}
              max={1}
              step={0.01}
              className="flex-1"
              data-testid="fader-main"
            />
            <span className="text-xs font-mono text-slate-400 w-12 text-right">
              {faderToDb(mainFader)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function faderToDb(value: number): string {
  if (value <= 0) return "-inf";
  if (value >= 1) return "+10 dB";
  if (value >= 0.75) {
    const db = ((value - 0.75) / 0.25) * 10;
    return db >= 0 ? `+${db.toFixed(0)} dB` : `${db.toFixed(0)} dB`;
  }
  const db = -60 + (value / 0.75) * 60;
  return `${db.toFixed(0)} dB`;
}
