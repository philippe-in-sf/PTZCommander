import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { mixerApi } from "@/lib/api";
import { useWebSocket, type MixerChannelState } from "@/lib/websocket";
import { ChannelStrip } from "./channel-strip";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

  const handleMainFaderChange = (value: number) => {
    setMainFader(value);
    ws?.send({
      type: "mixer_section_fader",
      section: "main",
      channel: 1,
      value,
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
      <div className="bg-[#1a1a2e] border border-[#2a2a3e] rounded-lg p-3">
        <div className="flex items-center gap-2 text-slate-400">
          <SlidersHorizontal className="h-4 w-4" />
          <span className="text-sm">Mixer</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#1a1a2e] border border-[#2a2a3e] rounded-lg overflow-hidden" data-testid="mixer-panel">
      <div className="flex items-center justify-between px-4 py-3 bg-[#12121f] border-b border-[#2a2a3e]">
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
              className="text-slate-400 hover:text-white p-1.5"
              data-testid="button-edit-mixer"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <Dialog open={addMixerOpen} onOpenChange={setAddMixerOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="border-[#3a3a4e] text-slate-300 hover:bg-[#2a2a3e] hover:text-white" data-testid="button-add-mixer">
                <Plus className="h-4 w-4 mr-1" />
                Add Mixer
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-slate-300 dark:bg-slate-900 border-slate-300 dark:border-slate-700">
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
        <DialogContent className="bg-slate-300 dark:bg-slate-900 border-slate-300 dark:border-slate-700">
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
        <div className="text-center py-8 text-slate-500">
          <SlidersHorizontal className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>No mixer configured</p>
          <p className="text-sm">Add your X32 to get started</p>
        </div>
      ) : (
        <div className="p-3 space-y-3">
          <div className="flex gap-1">
            {PANEL_SECTIONS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveSection(tab.key)}
                className={cn(
                  "px-3 py-1.5 text-xs font-semibold tracking-wide transition-colors border border-transparent",
                  activeSection === tab.key
                    ? "bg-[#2563eb] text-white border-[#3b82f6]"
                    : "text-slate-400 hover:text-white hover:bg-[#2a2a3e]"
                )}
                data-testid={`tab-panel-section-${tab.key}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex gap-0 overflow-x-auto pb-2">
            {channels.map((ch) => (
              <ChannelStrip
                key={`${activeSection}-${ch.channel}`}
                channel={ch.channel}
                name={ch.name}
                fader={ch.fader}
                muted={ch.muted}
                onFaderChange={handleFaderChange}
                onMuteToggle={handleMuteToggle}
              />
            ))}
          </div>

          <div className="flex items-center gap-3 p-2 bg-[#1e1e32] border border-[#2a2a3e]">
            <span className="text-xs font-bold text-cyan-400 tracking-wider">MAIN</span>
            <div className="flex-1 flex items-center">
              <HorizontalFader
                value={mainFader}
                onChange={handleMainFaderChange}
              />
            </div>
            <span className="text-[10px] font-mono text-green-400 w-10 text-right">
              {faderToDb(mainFader)}
            </span>
            <button
              onClick={handleMainMuteToggle}
              className={cn(
                "px-3 py-1 text-[9px] font-bold tracking-wider border transition-colors",
                mainMuted
                  ? "bg-red-600 border-red-500 text-white"
                  : "bg-[#2a2a3e] border-[#3a3a4e] text-slate-500 hover:text-slate-300 hover:bg-[#3a3a4e]"
              )}
              data-testid="mute-main"
            >
              MUTE
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface HorizontalFaderProps {
  value: number;
  onChange: (value: number) => void;
}

function HorizontalFader({ value, onChange }: HorizontalFaderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const knobWidth = 24;
  const trackPadding = 4;

  const updateValue = useCallback((e: React.PointerEvent) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const usableWidth = rect.width - knobWidth - trackPadding * 2;
    const x = e.clientX - rect.left - trackPadding - knobWidth / 2;
    const ratio = Math.max(0, Math.min(1, x / usableWidth));
    onChange(Math.round(ratio * 100) / 100);
  }, [onChange]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    isDragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updateValue(e);
  }, [updateValue]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (isDragging.current) updateValue(e);
  }, [updateValue]);

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  return (
    <div
      ref={trackRef}
      className="relative cursor-pointer select-none touch-none w-full"
      style={{ height: 28 }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div
        className="absolute top-1/2 -translate-y-1/2 rounded-sm"
        style={{
          height: 4,
          left: trackPadding,
          right: trackPadding,
          background: 'linear-gradient(to right, #1a1a2e, #0f0f1a)',
          boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5)',
        }}
      />
      <div
        className="absolute top-1/2 -translate-y-1/2 rounded-sm"
        style={{
          height: 4,
          left: trackPadding,
          width: `calc(${value * 100}% - ${trackPadding}px)`,
          background: 'linear-gradient(to right, #16a34a, #22c55e)',
          opacity: 0.7,
        }}
      />
      <div
        className="absolute top-1/2 -translate-y-1/2"
        style={{
          width: knobWidth,
          height: 20,
          left: `calc(${trackPadding}px + ${value} * (100% - ${knobWidth + trackPadding * 2}px))`,
          background: 'linear-gradient(to bottom, #5a5a6e, #3a3a4e, #2a2a3e)',
          borderRadius: 2,
          boxShadow: '0 1px 4px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.15)',
        }}
      >
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{
            width: 2,
            height: 12,
            background: 'rgba(255,255,255,0.3)',
            borderRadius: 1,
          }}
        />
      </div>
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
