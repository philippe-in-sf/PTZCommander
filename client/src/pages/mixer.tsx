import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { mixerApi } from "@/lib/api";
import { useWebSocket } from "@/lib/websocket";
import { useDeviceSetup } from "@/hooks/use-device-setup";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
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
  { key: "ch", label: "Channels 1-32", count: 32 },
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

const sectionCode: Record<MixerSection, string> = {
  ch: "CH",
  bus: "BUS",
  auxin: "AUX",
  fxrtn: "FX",
  mtx: "MTX",
  dca: "DCA",
};

export default function MixerPage() {
  const queryClient = useQueryClient();
  const ws = useWebSocket();
  const { openDeviceSetup } = useDeviceSetup();
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
      const section = typeof message.section === "string" ? message.section : "ch";
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

  const handleMainFaderChange = (value: number[]) => {
    setMainFader(value[0]);
    ws?.send({ type: "mixer_section_fader", section: "main", channel: 1, value: value[0] });
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
              <Button onClick={() => openDeviceSetup({ type: "mixer" })} data-testid="button-add-mixer-full">
                <Plus className="h-4 w-4 mr-2" /> Add Mixer
              </Button>
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
        <div className="flex-1 overflow-hidden bg-[#07090c] p-3 text-zinc-100 sm:p-5">
          <div className="mx-auto flex h-full min-h-0 max-w-[1540px] flex-col overflow-hidden rounded-md border border-black bg-[#12161a] shadow-[0_18px_50px_rgba(0,0,0,0.55)]">
            <div className="flex min-h-12 items-center justify-between border-b border-black bg-[linear-gradient(#24282c,#0d0f11)] px-4">
              <div className="flex min-w-0 items-center gap-3">
                <SlidersHorizontal className="h-4 w-4 text-sky-300" />
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold text-zinc-100">Audio Mixer</h2>
                  <p className="truncate text-xs text-zinc-500">{mixer.name}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                {mixer.status === "online" ? (
                  <Wifi className="h-4 w-4 text-emerald-400" />
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => connectMixerMutation.mutate(mixer.id)}
                    className="h-7 border border-zinc-700 bg-[#171a1d] px-2 text-xs text-zinc-200"
                    data-testid="button-connect-mixer-console"
                  >
                    <WifiOff className="h-3.5 w-3.5" /> Connect
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleEditClick}
                  className="h-7 w-7 border border-zinc-700 bg-[#171a1d] text-zinc-300"
                  data-testid="button-edit-mixer-console"
                >
                  <Settings className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

          {/* Fader Section */}
          <div className="flex-1 overflow-auto p-6">
            <div className="flex flex-wrap items-end justify-center gap-2">
              {channels.map((ch) => (
                <MixerChannelStrip
                  key={`${activeSection}-${ch.channel}`}
                  channel={ch.channel}
                  name={ch.name}
                  fader={ch.fader}
                  muted={ch.muted}
                  onFaderChange={(val) => handleFaderChange(activeSection, ch.channel, val)}
                  onMuteToggle={(muted) => handleMuteToggle(activeSection, ch.channel, muted)}
                />
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-hidden p-2">
              <div className="mixer-console-frame h-full overflow-x-auto overflow-y-hidden rounded-md border border-black bg-[#0a0c0e] p-1.5">
                <div className="flex h-full min-h-[420px] items-stretch gap-[3px]">
                  {channels.map((ch) => (
                    <MixerChannelStrip
                      key={`${activeSection}-${ch.channel}`}
                      section={activeSection}
                      channel={ch.channel}
                      name={ch.name}
                      fader={ch.fader}
                      muted={ch.muted}
                      onFaderChange={(val) => handleFaderChange(activeSection, ch.channel, val)}
                      onMuteToggle={(muted) => handleMuteToggle(activeSection, ch.channel, muted)}
                    />
                  ))}
                  <MainOutputStrip
                    fader={mainFader}
                    muted={mainMuted}
                    onFaderChange={handleMainFaderChange}
                    onMuteToggle={handleMainMuteToggle}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Mixer Dialog */}
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

interface MixerChannelStripProps {
  section: MixerSection;
  channel: number;
  name: string;
  fader: number;
  muted: boolean;
  onFaderChange: (value: number) => void;
  onMuteToggle: (muted: boolean) => void;
}

function MixerChannelStrip({ section, channel, name, fader, muted, onFaderChange, onMuteToggle }: MixerChannelStripProps) {
  const [localFader, setLocalFader] = useState(fader);

  useEffect(() => {
    setLocalFader(fader);
  }, [fader]);

  const handleFaderChange = (value: number[]) => {
    const newValue = value[0];
    setLocalFader(newValue);
    onFaderChange(newValue);
  };

  const dbValue = faderToDb(localFader);
  const displayName = name || `${SECTION_LABELS[section]} ${channel}`;

  return (
    <div
      className={cn(
        "grid w-[72px] grid-rows-[24px_160px_14px_28px_16px] items-center gap-2 p-3 rounded-lg bg-slate-300/50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700",
        muted && "opacity-60"
      )}
      data-testid={`mixer-strip-${channel}`}
    >
      <span className="flex h-6 w-full items-center justify-center overflow-hidden text-center text-[10px] leading-3 text-slate-500 dark:text-slate-400 font-mono" title={name}>
        <span className="line-clamp-2 break-words">{name}</span>
      </span>

      <div className="flex h-40 w-full items-center justify-center">
        <Slider
          orientation="vertical"
          value={[localFader]}
          onValueChange={handleFaderChange}
          min={0}
          max={1}
          step={0.01}
          className="h-36"
        />
      </div>

      <span className="flex h-3 w-full items-center justify-center text-[10px] leading-none text-slate-400 dark:text-slate-500 font-mono">
        {faderToDb(localFader)}
      </span>

      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-full p-0 min-h-0 text-[10px]"
        onClick={() => onMuteToggle(!muted)}
        data-testid={`mute-${channel}`}
      >
        MUTE
      </Button>

      <span className="flex h-4 items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-300">{channel}</span>
    </div>
  );
}

interface MainOutputStripProps {
  fader: number;
  muted: boolean;
  onFaderChange: (value: number[]) => void;
  onMuteToggle: () => void;
}

function MainOutputStrip({ fader, muted, onFaderChange, onMuteToggle }: MainOutputStripProps) {
  return (
    <div
      className={cn(
        "mixer-console-strip flex h-full min-w-[72px] flex-col items-center border border-black bg-[linear-gradient(90deg,#252b2e,#323a3d_52%,#1b2023)] px-2 py-1.5 shadow-[inset_1px_0_0_rgba(255,255,255,0.06),inset_-1px_0_0_rgba(0,0,0,0.8)]",
        muted && "opacity-70"
      )}
      data-testid="mixer-main-strip"
    >
      <div className="grid w-full gap-1">
        <div className="h-5 rounded-sm border border-black/70 bg-[#252b2f] text-center font-mono text-[10px] leading-5 text-zinc-200">
          MAIN
        </div>
        <div className="rounded-sm border border-black bg-[#16191c] text-center font-mono text-[9px] leading-4 text-zinc-500">
          LR
        </div>
        <div className="h-6 rounded-sm border border-black bg-[#121518] text-center font-mono text-[9px] leading-6 text-zinc-500">
          LAVE
        </div>
      </div>

      <div className="mt-2 flex items-center justify-center">
        <div className="mixer-fader-well relative flex h-[220px] w-11 items-center justify-center rounded-sm border border-black bg-[#0f1214] shadow-[inset_0_0_18px_rgba(0,0,0,0.75)]">
          <div className="absolute inset-y-3 left-2 w-px bg-zinc-500/30" />
          <div className="absolute inset-y-3 right-2 w-px bg-zinc-500/30" />
          <div className="absolute left-2 right-2 top-1/2 h-px bg-sky-300/35" />
          <Slider
            orientation="vertical"
            value={[fader]}
            onValueChange={onFaderChange}
            min={0}
            max={1}
            step={0.01}
            className="mixer-console-slider h-[196px] w-8"
            data-testid="fader-main-full"
          />
        </div>
      </div>

      <span className="mt-1 h-4 font-mono text-[9px] leading-4 text-zinc-400">{faderToDb(fader)}</span>

      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "mt-1 h-6 min-h-0 w-full rounded-sm border px-1 font-mono text-[9px]",
          muted
            ? "border-red-500/80 bg-red-600 text-white"
            : "border-black bg-[#2d3337] text-zinc-200"
        )}
        onClick={onMuteToggle}
        data-testid="mute-main-full"
      >
        MUTE
      </Button>

      <div className="mt-1 h-6 w-full rounded-sm border border-black bg-[#1b2227] text-center font-mono text-[10px] leading-6 text-zinc-300">
        LR
      </div>
    </div>
  );
}

function stripToneClass(section: MixerSection, channel: number): string {
  if (section === "bus" || section === "auxin") {
    return channel % 4 === 0
      ? "bg-[linear-gradient(90deg,rgba(19,62,57,0.95),rgba(27,92,76,0.95)_52%,rgba(16,48,47,0.95))]"
      : "bg-[linear-gradient(90deg,rgba(23,45,43,0.95),rgba(32,67,60,0.95)_52%,rgba(18,39,38,0.95))]";
  }

  if (section === "dca" || section === "mtx") {
    return "bg-[linear-gradient(90deg,rgba(33,39,42,0.98),rgba(48,57,60,0.98)_52%,rgba(26,31,34,0.98))]";
  }

  if (section === "fxrtn") {
    return "bg-[linear-gradient(90deg,rgba(47,39,34,0.98),rgba(62,50,41,0.98)_52%,rgba(35,30,27,0.98))]";
  }

  if (channel % 8 === 0 || channel % 8 === 7) {
    return "bg-[linear-gradient(90deg,rgba(18,58,53,0.95),rgba(27,89,73,0.95)_52%,rgba(17,46,44,0.95))]";
  }

  if (channel % 4 === 0) {
    return "bg-[linear-gradient(90deg,rgba(42,36,34,0.98),rgba(56,45,39,0.98)_52%,rgba(30,27,26,0.98))]";
  }

  return "";
}

function shortStripName(name: string, channel: number): string {
  const trimmed = name.trim();
  if (!trimmed) return String(channel);
  const compact = trimmed
    .replace(/channel/i, "CH")
    .replace(/\s+/g, " ")
    .trim();
  return compact.length <= 5 ? compact : compact.slice(0, 5).toUpperCase();
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
