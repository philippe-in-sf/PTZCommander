import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { mixerApi } from "@/lib/api";
import { useWebSocket, type MixerChannelState } from "@/lib/websocket";
import { useDeviceSetup } from "@/hooks/use-device-setup";
import { ChannelStrip } from "./channel-strip";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Plus, Wifi, WifiOff, SlidersHorizontal, Settings, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Mixer } from "@shared/schema";

type MixerSection = "ch" | "bus" | "dca";

interface SectionChannelState {
  channel: number;
  section: string;
  fader: number;
  muted: boolean;
  name: string;
}

const PANEL_SECTIONS: { key: MixerSection; label: string; count: number }[] = [
  { key: "ch", label: "Channels", count: 16 },
  { key: "bus", label: "Bus", count: 16 },
  { key: "dca", label: "DCA", count: 8 },
];

const SECTION_LABELS: Record<MixerSection, string> = {
  ch: "Ch",
  bus: "Bus",
  dca: "DCA",
};

interface MixerPanelProps {
  collapsed?: boolean;
}

export function MixerPanel({ collapsed = false }: MixerPanelProps) {
  const queryClient = useQueryClient();
  const ws = useWebSocket();
  const { openDeviceSetup } = useDeviceSetup();
  const [activeSection, setActiveSection] = useState<MixerSection>("ch");
  const [addMixerOpen, setAddMixerOpen] = useState(false);
  const [editMixerOpen, setEditMixerOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newMixer, setNewMixer] = useState({ name: "X32 Compact", ip: "", port: 10023 });
  const [editForm, setEditForm] = useState({ name: "", ip: "", port: 10023 });
  const [mainFader, setMainFader] = useState(0.75);
  const [mainMuted, setMainMuted] = useState(false);

  const [sectionStates, setSectionStates] = useState<Map<string, SectionChannelState>>(new Map());

  const { data: mixers = [] } = useQuery({
    queryKey: ["mixers"],
    queryFn: mixerApi.getAll,
  });

  const mixer = mixers[0];

  const handleMixerState = useCallback((message: Record<string, unknown>) => {
    if (message.type === "mixer_state" && Array.isArray(message.channels)) {
      const section = (message.section as string) || "ch";
      setSectionStates(prev => {
        const newMap = new Map(prev);
        (message.channels as SectionChannelState[]).forEach((ch) => {
          const key = `${section}:${ch.channel}`;
          newMap.set(key, { ...ch, section });

          if (section === "main" && ch.channel === 1) {
            setMainFader(ch.fader);
            setMainMuted(ch.muted);
          }
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
        if (status.sections) {
          setSectionStates(prev => {
            const newMap = new Map(prev);
            const sections = status.sections!;
            for (const [section, channels] of Object.entries(sections)) {
              (channels as SectionChannelState[]).forEach((ch) => {
                const key = `${section}:${ch.channel}`;
                newMap.set(key, { ...ch, section });
              });
            }
            if (sections.main?.[0]) {
              setMainFader(sections.main[0].fader);
              setMainMuted(sections.main[0].muted);
            }
            return newMap;
          });
        } else if (status.channels && status.channels.length > 0) {
          setSectionStates(prev => {
            const newMap = new Map(prev);
            status.channels.forEach((ch: MixerChannelState) => {
              const key = `ch:${ch.channel}`;
              newMap.set(key, { ...ch, section: "ch" });
            });
            return newMap;
          });
        }
      }).catch(() => {});

      ws?.send({ type: "mixer_query_section", section: activeSection });
    }
  }, [mixer]);

  useEffect(() => {
    if (mixer && mixer.status === "online") {
      ws?.send({ type: "mixer_query_section", section: activeSection });
    }
  }, [activeSection, mixer]);

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

  const updateMixerMutation = useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: Partial<Mixer> }) => mixerApi.update(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mixers"] });
      setEditMixerOpen(false);
      toast.success("Mixer updated successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const deleteMixerMutation = useMutation({
    mutationFn: mixerApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mixers"] });
      setEditMixerOpen(false);
      setConfirmDelete(false);
      toast.success("Mixer deleted");
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

  const handleEditClick = () => {
    if (mixer) {
      setEditForm({
        name: mixer.name,
        ip: mixer.ip,
        port: mixer.port || 10023,
      });
      setConfirmDelete(false);
      setEditMixerOpen(true);
    }
  };

  const handleSave = () => {
    if (mixer) {
      updateMixerMutation.mutate({ id: mixer.id, updates: editForm });
    }
  };

  const handleDelete = () => {
    if (mixer) {
      deleteMixerMutation.mutate(mixer.id);
    }
  };

  const handleFaderChange = (channel: number, value: number) => {
    const key = `${activeSection}:${channel}`;
    setSectionStates(prev => {
      const newMap = new Map(prev);
      const label = SECTION_LABELS[activeSection];
      const current = newMap.get(key) || { channel, section: activeSection, fader: 0.75, muted: false, name: `${label} ${channel}` };
      newMap.set(key, { ...current, fader: value });
      return newMap;
    });

    ws?.send({
      type: "mixer_section_fader",
      section: activeSection,
      channel,
      value,
    });
  };

  const handleMuteToggle = (channel: number, muted: boolean) => {
    const key = `${activeSection}:${channel}`;
    setSectionStates(prev => {
      const newMap = new Map(prev);
      const label = SECTION_LABELS[activeSection];
      const current = newMap.get(key) || { channel, section: activeSection, fader: 0.75, muted: false, name: `${label} ${channel}` };
      newMap.set(key, { ...current, muted });
      return newMap;
    });

    ws?.send({
      type: "mixer_section_mute",
      section: activeSection,
      channel,
      muted,
    });
  };

  const handleMainFaderChange = (value: number[]) => {
    setMainFader(value[0]);
    ws?.send({
      type: "mixer_section_fader",
      section: "main",
      channel: 1,
      value: value[0],
    });
  };

  const handleMainMuteToggle = () => {
    const newMuted = !mainMuted;
    setMainMuted(newMuted);
    ws?.send({
      type: "mixer_section_mute",
      section: "main",
      channel: 1,
      muted: newMuted,
    });
  };

  const activeSectionConfig = PANEL_SECTIONS.find(s => s.key === activeSection)!;
  const channels = Array.from({ length: activeSectionConfig.count }, (_, i) => {
    const ch = i + 1;
    const key = `${activeSection}:${ch}`;
    const label = SECTION_LABELS[activeSection];
    return sectionStates.get(key) || { channel: ch, section: activeSection, fader: 0.75, muted: false, name: `${label} ${ch}` };
  });

  if (collapsed) {
    return (
      <div className="bg-slate-300/80 dark:bg-slate-900/80 border border-slate-300 dark:border-slate-700 rounded-lg p-3">
        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-400">
          <SlidersHorizontal className="h-4 w-4" />
          <span className="text-sm">Mixer</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-300/80 dark:bg-slate-900/80 border border-slate-300 dark:border-slate-700 rounded-lg p-4" data-testid="mixer-panel">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-5 w-5 text-cyan-500 dark:text-cyan-400" />
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Audio Mixer</h2>
        </div>

        {mixer ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-700 dark:text-slate-400">{mixer.name}</span>
            {mixer.status === "online" ? (
              <Wifi className="h-4 w-4 text-green-500" />
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => connectMixerMutation.mutate(mixer.id)}
                className="text-slate-700 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                data-testid="button-connect-mixer"
              >
                <WifiOff className="h-4 w-4 mr-1" />
                Connect
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleEditClick}
              className="text-slate-700 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white p-1.5"
              data-testid="button-edit-mixer"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <Dialog open={addMixerOpen} onOpenChange={setAddMixerOpen}>
            <Button variant="outline" size="sm" onClick={() => openDeviceSetup({ type: "mixer" })} data-testid="button-add-mixer">
              <Plus className="h-4 w-4 mr-1" />
              Add Mixer
            </Button>
            <DialogContent>
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

      <Dialog open={editMixerOpen} onOpenChange={(open) => { setEditMixerOpen(open); if (!open) setConfirmDelete(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mixer Settings</DialogTitle>
          </DialogHeader>

          {!confirmDelete ? (
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-mixer-name">Name</Label>
                <Input
                  id="edit-mixer-name"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  data-testid="input-edit-mixer-name"
                />
              </div>
              <div>
                <Label htmlFor="edit-mixer-ip">IP Address</Label>
                <Input
                  id="edit-mixer-ip"
                  value={editForm.ip}
                  onChange={(e) => setEditForm({ ...editForm, ip: e.target.value })}
                  data-testid="input-edit-mixer-ip"
                />
              </div>
              <div>
                <Label htmlFor="edit-mixer-port">Port</Label>
                <Input
                  id="edit-mixer-port"
                  type="number"
                  value={editForm.port}
                  onChange={(e) => setEditForm({ ...editForm, port: parseInt(e.target.value) || 10023 })}
                  data-testid="input-edit-mixer-port"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  onClick={handleSave}
                  disabled={!editForm.ip || updateMixerMutation.isPending}
                  data-testid="button-save-mixer-edit"
                >
                  {updateMixerMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setConfirmDelete(true)}
                  data-testid="button-delete-mixer"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg">
                <AlertTriangle className="h-6 w-6 text-red-500 flex-shrink-0" />
                <div>
                  <p className="text-slate-900 dark:text-white font-medium">Delete {mixer?.name}?</p>
                  <p className="text-sm text-slate-700 dark:text-slate-400">This will remove the mixer configuration and disconnect it.</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setConfirmDelete(false)}
                  data-testid="button-cancel-delete-mixer"
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={handleDelete}
                  disabled={deleteMixerMutation.isPending}
                  data-testid="button-confirm-delete-mixer"
                >
                  {deleteMixerMutation.isPending ? "Deleting..." : "Delete Mixer"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {!mixer ? (
        <div className="text-center py-8 text-slate-700 dark:text-slate-500">
          <SlidersHorizontal className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>No mixer configured</p>
          <p className="text-sm">Add your X32 to get started</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex gap-1 mb-2">
            {PANEL_SECTIONS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveSection(tab.key)}
                className={cn(
                  "px-3 py-1.5 rounded text-xs font-medium transition-colors",
                  activeSection === tab.key
                    ? "bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-400/30 dark:hover:bg-slate-800"
                )}
                data-testid={`tab-panel-section-${tab.key}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-end gap-1 overflow-x-auto pb-2">
            {channels.map((ch) => {
              return (
                <ChannelStrip
                  key={`${activeSection}-${ch.channel}`}
                  section={activeSection}
                  channel={ch.channel}
                  name={ch.name}
                  fader={ch.fader}
                  muted={ch.muted}
                  onFaderChange={handleFaderChange}
                  onMuteToggle={handleMuteToggle}
                />
              );
            })}

            <div
              className={cn(
                "mixer-console-strip flex min-h-[292px] min-w-[68px] flex-col items-center border border-black bg-[linear-gradient(90deg,#252b2e,#323a3d_52%,#1b2023)] px-2 py-1.5 shadow-[inset_1px_0_0_rgba(255,255,255,0.06),inset_-1px_0_0_rgba(0,0,0,0.8)]",
                mainMuted && "opacity-70"
              )}
              data-testid="mixer-main-panel-strip"
            >
              <div className="grid w-full gap-1">
                <div className="h-5 rounded-sm border border-black/70 bg-[#252b2f] text-center font-mono text-[10px] leading-5 text-zinc-200">
                  MAIN
                </div>
                <div className="rounded-sm border border-black bg-[#16191c] text-center font-mono text-[9px] leading-4 text-zinc-500">
                  LR
                </div>
                <div className="h-6 rounded-sm border border-black bg-[#121518] text-center font-mono text-[9px] leading-6 text-zinc-500">
                  LEVEL
                </div>
              </div>

              <div className="mt-2 flex items-center justify-center">
                <div className="mixer-fader-well relative flex h-[170px] w-11 items-center justify-center rounded-sm border border-black bg-[#0f1214] shadow-[inset_0_0_18px_rgba(0,0,0,0.75)]">
                  <div className="absolute inset-y-3 left-2 w-px bg-zinc-500/30" />
                  <div className="absolute inset-y-3 right-2 w-px bg-zinc-500/30" />
                  <div className="absolute left-2 right-2 top-1/2 h-px bg-sky-300/35" />
                  <Slider
                    orientation="vertical"
                    value={[mainFader]}
                    onValueChange={handleMainFaderChange}
                    min={0}
                    max={1}
                    step={0.01}
                    className="mixer-console-slider h-[150px] w-8"
                    data-testid="fader-main"
                  />
                </div>
              </div>

              <span className="mt-1 h-4 font-mono text-[9px] leading-4 text-zinc-400">
                {faderToDb(mainFader)}
              </span>

              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "mt-1 h-6 min-h-0 w-full rounded-sm border px-1 font-mono text-[9px]",
                  mainMuted
                    ? "border-red-500/80 bg-red-600 text-white"
                    : "border-black bg-[#2d3337] text-zinc-200"
                )}
                onClick={handleMainMuteToggle}
                data-testid="mute-main"
              >
                MUTE
              </Button>

              <div className="mt-1 h-6 w-full rounded-sm border border-black bg-[#1b2227] text-center font-mono text-[10px] leading-6 text-zinc-300">
                LR
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function faderToDb(value: number): string {
  if (value <= 0) return "-inf";
  if (value >= 1) return "+10";
  if (value >= 0.75) {
    const db = ((value - 0.75) / 0.25) * 10;
    return db >= 0 ? `+${db.toFixed(0)}` : `${db.toFixed(0)}`;
  }
  const db = -60 + (value / 0.75) * 60;
  return `${db.toFixed(0)}`;
}
