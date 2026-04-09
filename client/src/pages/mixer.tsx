import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { mixerApi } from "@/lib/api";
import { useWebSocket } from "@/lib/websocket";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Wifi, WifiOff, SlidersHorizontal, Settings, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AppLayout } from "@/components/app-layout";
import type { Mixer } from "@shared/schema";

type MixerSection = "ch" | "bus" | "auxin" | "fxrtn" | "mtx" | "dca";

interface SectionChannelState {
  channel: number;
  section: string;
  fader: number;
  muted: boolean;
  name: string;
}

const SECTION_TABS: { key: MixerSection; label: string; count: number }[] = [
  { key: "ch", label: "Channels", count: 32 },
  { key: "bus", label: "Mix Bus", count: 16 },
  { key: "auxin", label: "Aux In", count: 8 },
  { key: "fxrtn", label: "FX Returns", count: 8 },
  { key: "mtx", label: "Matrix", count: 6 },
  { key: "dca", label: "DCA", count: 8 },
];

const SECTION_LABELS: Record<MixerSection, string> = {
  ch: "Ch",
  bus: "Bus",
  auxin: "Aux",
  fxrtn: "FX",
  mtx: "Mtx",
  dca: "DCA",
};

export default function MixerPage() {
  const queryClient = useQueryClient();
  const ws = useWebSocket();
  const [activeSection, setActiveSection] = useState<MixerSection>("ch");
  const [addMixerOpen, setAddMixerOpen] = useState(false);
  const [editMixerOpen, setEditMixerOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newMixer, setNewMixer] = useState({ name: "X32 Compact", ip: "", port: 10023 });
  const [editForm, setEditForm] = useState({ name: "", ip: "", port: 10023 });

  const [sectionStates, setSectionStates] = useState<Map<string, SectionChannelState>>(new Map());
  const [mainFader, setMainFader] = useState(0.75);
  const [mainMuted, setMainMuted] = useState(false);

  const { data: mixers = [] } = useQuery({
    queryKey: ["mixers"],
    queryFn: mixerApi.getAll,
  });

  const mixer = mixers[0];

  const handleMixerState = useCallback((message: Record<string, unknown>) => {
    if (message.type === "mixer_state" && Array.isArray(message.channels)) {
      const section = message.section || "ch";
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
        } else if (status.channels?.length > 0) {
          setSectionStates(prev => {
            const newMap = new Map(prev);
            status.channels.forEach((ch: SectionChannelState) => {
              const key = `ch:${ch.channel}`;
              newMap.set(key, { ...ch, section: "ch" });
            });
            return newMap;
          });
        }
      }).catch(console.error);

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
    onError: (error: Error) => toast.error(error.message),
  });

  const updateMixerMutation = useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: Partial<Mixer> }) => mixerApi.update(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mixers"] });
      setEditMixerOpen(false);
      toast.success("Mixer updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMixerMutation = useMutation({
    mutationFn: mixerApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mixers"] });
      setEditMixerOpen(false);
      setConfirmDelete(false);
      toast.success("Mixer deleted");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const connectMixerMutation = useMutation({
    mutationFn: mixerApi.connect,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["mixers"] });
      if (data.success) toast.success("Connected to mixer");
      else toast.error("Failed to connect to mixer");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const handleEditClick = () => {
    if (mixer) {
      setEditForm({ name: mixer.name, ip: mixer.ip, port: mixer.port || 10023 });
      setConfirmDelete(false);
      setEditMixerOpen(true);
    }
  };

  const handleFaderChange = (section: MixerSection, channel: number, value: number) => {
    const key = `${section}:${channel}`;
    setSectionStates(prev => {
      const newMap = new Map(prev);
      const label = SECTION_LABELS[section];
      const current = newMap.get(key) || { channel, section, fader: 0.75, muted: false, name: `${label} ${channel}` };
      newMap.set(key, { ...current, fader: value });
      return newMap;
    });

    ws?.send({ type: "mixer_section_fader", section, channel, value });
  };

  const handleMuteToggle = (section: MixerSection, channel: number, muted: boolean) => {
    const key = `${section}:${channel}`;
    setSectionStates(prev => {
      const newMap = new Map(prev);
      const label = SECTION_LABELS[section];
      const current = newMap.get(key) || { channel, section, fader: 0.75, muted: false, name: `${label} ${channel}` };
      newMap.set(key, { ...current, muted });
      return newMap;
    });

    ws?.send({ type: "mixer_section_mute", section, channel, muted });
  };

  const handleMainFaderChange = (value: number) => {
    setMainFader(value);
    ws?.send({ type: "mixer_section_fader", section: "main", channel: 1, value });
  };

  const handleMainMuteToggle = () => {
    const newMuted = !mainMuted;
    setMainMuted(newMuted);
    ws?.send({ type: "mixer_section_mute", section: "main", channel: 1, muted: newMuted });
  };

  const activeSectionConfig = SECTION_TABS.find(s => s.key === activeSection)!;
  const channels = Array.from({ length: activeSectionConfig.count }, (_, i) => {
    const ch = i + 1;
    const key = `${activeSection}:${ch}`;
    const label = SECTION_LABELS[activeSection];
    return sectionStates.get(key) || { channel: ch, section: activeSection, fader: 0.75, muted: false, name: `${label} ${ch}` };
  });

  const mixerHeaderRight = mixer ? (
    <div className="flex items-center gap-2">
      <span className="text-sm text-slate-500 dark:text-slate-400">{mixer.name}</span>
      {mixer.status === "online" ? (
        <Wifi className="h-4 w-4 text-green-500" />
      ) : (
        <Button variant="ghost" size="sm" onClick={() => connectMixerMutation.mutate(mixer.id)} className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white" data-testid="button-connect-mixer">
          <WifiOff className="h-4 w-4 mr-1" /> Connect
        </Button>
      )}
      <Button variant="ghost" size="sm" onClick={handleEditClick} className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white p-1.5" data-testid="button-edit-mixer-full">
        <Settings className="h-4 w-4" />
      </Button>
    </div>
  ) : null;

  return (
    <AppLayout activePage="/mixer" headerRight={mixerHeaderRight}>
      {!mixer ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <SlidersHorizontal className="h-16 w-16 mx-auto text-slate-400 dark:text-slate-600" />
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">No Mixer Configured</h2>
            <p className="text-slate-500 dark:text-slate-400">Add your Behringer X32/M32 to get started</p>
            <Dialog open={addMixerOpen} onOpenChange={setAddMixerOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-mixer-full">
                  <Plus className="h-4 w-4 mr-2" /> Add Mixer
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-slate-300 dark:bg-slate-900 border-slate-300 dark:border-slate-700">
                <DialogHeader><DialogTitle>Add X32 Mixer</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="mixer-name-full">Name</Label>
                    <Input id="mixer-name-full" value={newMixer.name} onChange={(e) => setNewMixer({ ...newMixer, name: e.target.value })} placeholder="X32 Compact" className="bg-slate-300 dark:bg-slate-800 border-slate-300 dark:border-slate-600" data-testid="input-mixer-name-full" />
                  </div>
                  <div>
                    <Label htmlFor="mixer-ip-full">IP Address</Label>
                    <Input id="mixer-ip-full" value={newMixer.ip} onChange={(e) => setNewMixer({ ...newMixer, ip: e.target.value })} placeholder="192.168.0.64" className="bg-slate-300 dark:bg-slate-800 border-slate-300 dark:border-slate-600" data-testid="input-mixer-ip-full" />
                  </div>
                  <div>
                    <Label htmlFor="mixer-port-full">Port</Label>
                    <Input id="mixer-port-full" type="number" value={newMixer.port} onChange={(e) => setNewMixer({ ...newMixer, port: parseInt(e.target.value) || 10023 })} className="bg-slate-300 dark:bg-slate-800 border-slate-300 dark:border-slate-600" data-testid="input-mixer-port-full" />
                  </div>
                  <Button className="w-full" onClick={() => createMixerMutation.mutate(newMixer)} disabled={!newMixer.ip || createMixerMutation.isPending} data-testid="button-save-mixer-full">
                    {createMixerMutation.isPending ? "Adding..." : "Add Mixer"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden bg-[#1a1a2e] dark:bg-[#1a1a2e]">
          <div className="border-b border-[#2a2a3e] bg-[#12121f] px-4">
            <div className="flex items-center gap-1 py-2">
              {SECTION_TABS.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveSection(tab.key)}
                  className={cn(
                    "px-5 py-2.5 text-sm font-semibold tracking-wide transition-colors border border-transparent",
                    activeSection === tab.key
                      ? "bg-[#2563eb] text-white border-[#3b82f6]"
                      : "text-slate-400 hover:text-white hover:bg-[#2a2a3e]"
                  )}
                  data-testid={`tab-section-${tab.key}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            <div className="flex h-full">
              <div className="flex-1 flex gap-0 overflow-x-auto p-3 pb-4">
                {channels.map((ch) => (
                  <ConsoleChannelStrip
                    key={`${activeSection}-${ch.channel}`}
                    channel={ch.channel}
                    name={ch.name}
                    fader={ch.fader}
                    muted={ch.muted}
                    sectionLabel={SECTION_LABELS[activeSection]}
                    onFaderChange={(val) => handleFaderChange(activeSection, ch.channel, val)}
                    onMuteToggle={(muted) => handleMuteToggle(activeSection, ch.channel, muted)}
                  />
                ))}
              </div>

              <div className="w-[80px] flex-shrink-0 border-l border-[#2a2a3e] p-2 flex flex-col items-center">
                <div className="text-[10px] font-bold text-cyan-400 mb-1 tracking-wider">MAIN</div>
                <div className="text-[10px] text-slate-400 font-mono mb-2">{faderToDb(mainFader)}</div>
                <div className="flex-1 flex items-center justify-center w-full">
                  <ConsoleFader
                    value={mainFader}
                    onChange={handleMainFaderChange}
                    height={280}
                  />
                </div>
                <button
                  onClick={handleMainMuteToggle}
                  className={cn(
                    "w-full mt-2 py-1.5 text-[10px] font-bold tracking-wider border transition-colors",
                    mainMuted
                      ? "bg-red-600 border-red-500 text-white"
                      : "bg-[#2a2a3e] border-[#3a3a4e] text-slate-400 hover:text-white hover:bg-[#3a3a4e]"
                  )}
                  data-testid="mute-main-full"
                >
                  MUTE
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Dialog open={editMixerOpen} onOpenChange={(open) => { setEditMixerOpen(open); if (!open) setConfirmDelete(false); }}>
        <DialogContent className="bg-slate-300 dark:bg-slate-900 border-slate-300 dark:border-slate-700">
          <DialogHeader><DialogTitle>Mixer Settings</DialogTitle></DialogHeader>
          {!confirmDelete ? (
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-mixer-name-full">Name</Label>
                <Input id="edit-mixer-name-full" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="bg-slate-300 dark:bg-slate-800 border-slate-300 dark:border-slate-600" data-testid="input-edit-mixer-name-full" />
              </div>
              <div>
                <Label htmlFor="edit-mixer-ip-full">IP Address</Label>
                <Input id="edit-mixer-ip-full" value={editForm.ip} onChange={(e) => setEditForm({ ...editForm, ip: e.target.value })} className="bg-slate-300 dark:bg-slate-800 border-slate-300 dark:border-slate-600" data-testid="input-edit-mixer-ip-full" />
              </div>
              <div>
                <Label htmlFor="edit-mixer-port-full">Port</Label>
                <Input id="edit-mixer-port-full" type="number" value={editForm.port} onChange={(e) => setEditForm({ ...editForm, port: parseInt(e.target.value) || 10023 })} className="bg-slate-300 dark:bg-slate-800 border-slate-300 dark:border-slate-600" data-testid="input-edit-mixer-port-full" />
              </div>
              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => mixer && updateMixerMutation.mutate({ id: mixer.id, updates: editForm })} disabled={!editForm.ip || updateMixerMutation.isPending} data-testid="button-save-mixer-edit-full">
                  {updateMixerMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
                <Button variant="destructive" onClick={() => setConfirmDelete(true)} data-testid="button-delete-mixer-full">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                <AlertTriangle className="h-6 w-6 text-red-500 flex-shrink-0" />
                <div>
                  <p className="text-slate-900 dark:text-white font-medium">Delete {mixer?.name}?</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">This will remove the mixer and disconnect.</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                <Button variant="destructive" className="flex-1" onClick={() => mixer && deleteMixerMutation.mutate(mixer.id)} disabled={deleteMixerMutation.isPending}>
                  {deleteMixerMutation.isPending ? "Deleting..." : "Delete Mixer"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

interface ConsoleFaderProps {
  value: number;
  onChange: (value: number) => void;
  height?: number;
}

function ConsoleFader({ value, onChange, height = 240 }: ConsoleFaderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const knobHeight = 28;
  const trackPadding = 6;
  const usableHeight = height - knobHeight - trackPadding * 2;
  const knobTop = trackPadding + (1 - value) * usableHeight;

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    isDragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updateValue(e);
  }, []);

  const updateValue = useCallback((e: React.PointerEvent) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top - trackPadding - knobHeight / 2;
    const ratio = 1 - Math.max(0, Math.min(1, y / usableHeight));
    onChange(Math.round(ratio * 100) / 100);
  }, [usableHeight, onChange]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (isDragging.current) updateValue(e);
  }, [updateValue]);

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  const fillHeight = value * usableHeight;

  return (
    <div
      ref={trackRef}
      className="relative cursor-pointer select-none touch-none"
      style={{ width: 40, height }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div
        className="absolute left-1/2 -translate-x-1/2 rounded-sm"
        style={{
          width: 6,
          top: trackPadding,
          bottom: trackPadding,
          background: 'linear-gradient(to bottom, #1a1a2e, #0f0f1a)',
          boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5)',
        }}
      />

      <div
        className="absolute left-1/2 -translate-x-1/2 rounded-sm"
        style={{
          width: 6,
          bottom: trackPadding,
          height: fillHeight,
          background: 'linear-gradient(to top, #22c55e, #16a34a)',
          opacity: 0.7,
        }}
      />

      {[0, 0.25, 0.5, 0.75, 1].map((mark) => (
        <div
          key={mark}
          className="absolute"
          style={{
            left: 2,
            right: 2,
            top: trackPadding + (1 - mark) * usableHeight + knobHeight / 2 - 0.5,
            height: 1,
            background: 'rgba(255,255,255,0.08)',
          }}
        />
      ))}

      <div
        className="absolute left-1/2 -translate-x-1/2"
        style={{
          width: 32,
          height: knobHeight,
          top: knobTop,
          background: 'linear-gradient(to bottom, #5a5a6e, #3a3a4e, #2a2a3e)',
          borderRadius: 3,
          boxShadow: '0 1px 4px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.15)',
        }}
      >
        <div
          className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2"
          style={{
            width: 20,
            height: 2,
            background: 'rgba(255,255,255,0.3)',
            borderRadius: 1,
          }}
        />
      </div>
    </div>
  );
}

interface ConsoleChannelStripProps {
  channel: number;
  name: string;
  fader: number;
  muted: boolean;
  sectionLabel: string;
  onFaderChange: (value: number) => void;
  onMuteToggle: (muted: boolean) => void;
}

function ConsoleChannelStrip({ channel, name, fader, muted, sectionLabel, onFaderChange, onMuteToggle }: ConsoleChannelStripProps) {
  const [localFader, setLocalFader] = useState(fader);

  useEffect(() => {
    setLocalFader(fader);
  }, [fader]);

  const handleFaderChange = (value: number) => {
    setLocalFader(value);
    onFaderChange(value);
  };

  const dbStr = faderToDb(localFader);

  return (
    <div
      className={cn(
        "flex flex-col items-center flex-shrink-0 bg-[#1e1e32] border border-[#2a2a3e] px-1 py-2",
        muted && "opacity-50"
      )}
      style={{ width: 62 }}
      data-testid={`mixer-strip-${channel}`}
    >
      <div className="text-[9px] font-bold text-slate-300 truncate w-full text-center mb-1 tracking-wide" title={name}>
        {name}
      </div>

      <div className="text-[9px] font-mono text-green-400 mb-1">
        {dbStr}
      </div>

      <div className="w-full flex items-center justify-center flex-1 my-1">
        <ConsoleFader
          value={localFader}
          onChange={handleFaderChange}
          height={220}
        />
      </div>

      <button
        onClick={() => onMuteToggle(!muted)}
        className={cn(
          "w-full py-1 text-[9px] font-bold tracking-wider border transition-colors mt-1",
          muted
            ? "bg-red-600 border-red-500 text-white"
            : "bg-[#2a2a3e] border-[#3a3a4e] text-slate-500 hover:text-slate-300 hover:bg-[#3a3a4e]"
        )}
        data-testid={`mute-ch-${channel}`}
      >
        MUTE
      </button>

      <div className="text-[10px] font-bold text-slate-400 mt-1">
        {sectionLabel} {channel}
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
