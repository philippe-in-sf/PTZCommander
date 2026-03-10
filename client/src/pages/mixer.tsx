import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { mixerApi } from "@/lib/api";
import { useWebSocket } from "@/lib/websocket";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Volume2, VolumeX, Plus, Wifi, WifiOff, SlidersHorizontal, Settings, Trash2, AlertTriangle } from "lucide-react";
import { APP_VERSION } from "@shared/version";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { LogViewer } from "@/components/logs/log-viewer";
import { LayoutSelector } from "@/components/layouts/layout-selector";
import { Video } from "lucide-react";
import { Link } from "wouter";
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
    refetchInterval: 5000,
  });

  const mixer = mixers[0];

  const handleMixerState = useCallback((message: any) => {
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

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col overflow-hidden">
      {/* Top Bar */}
      <header className="h-14 border-b border-border bg-slate-950/50 backdrop-blur-md flex items-center justify-between px-6 z-50">
        <div className="flex items-center gap-3">
          <Link href="/">
            <div className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity">
              <div className="w-8 h-8 rounded bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.4)]">
                <Video className="text-white w-4 h-4" />
              </div>
              <div>
                <h1 className="font-bold tracking-tight text-lg leading-none">
                  PTZ<span className="text-cyan-500 font-light">COMMAND</span>
                </h1>
                <span className="text-[10px] font-mono text-cyan-700 italic tracking-widest" data-testid="text-version">v{APP_VERSION}</span>
              </div>
            </div>
          </Link>

          <nav className="flex items-center gap-1 ml-6">
            <Link href="/">
              <button className="px-3 py-1.5 rounded text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors" data-testid="nav-dashboard">
                Dashboard
              </button>
            </Link>
            <Link href="/scenes">
              <button className="px-3 py-1.5 rounded text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors" data-testid="nav-scenes">
                Scenes
              </button>
            </Link>
            <Link href="/switcher">
              <button className="px-3 py-1.5 rounded text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors" data-testid="nav-switcher">
                Video Switcher
              </button>
            </Link>
            <button className="px-3 py-1.5 rounded text-sm font-medium text-white bg-slate-800 border border-slate-700" data-testid="nav-mixer">
              Audio Mixer
            </button>
          </nav>
        </div>

        <div className="flex items-center gap-4">
          {mixer ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-400">{mixer.name}</span>
              {mixer.status === "online" ? (
                <Wifi className="h-4 w-4 text-green-500" />
              ) : (
                <Button variant="ghost" size="sm" onClick={() => connectMixerMutation.mutate(mixer.id)} className="text-slate-400 hover:text-white" data-testid="button-connect-mixer">
                  <WifiOff className="h-4 w-4 mr-1" /> Connect
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={handleEditClick} className="text-slate-400 hover:text-white p-1.5" data-testid="button-edit-mixer-full">
                <Settings className="h-4 w-4" />
              </Button>
            </div>
          ) : null}
          <LayoutSelector />
          <LogViewer />
        </div>
      </header>

      {/* Main Content */}
      {!mixer ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <SlidersHorizontal className="h-16 w-16 mx-auto text-slate-600" />
            <h2 className="text-xl font-semibold text-white">No Mixer Configured</h2>
            <p className="text-slate-400">Add your Behringer X32/M32 to get started</p>
            <Dialog open={addMixerOpen} onOpenChange={setAddMixerOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-mixer-full">
                  <Plus className="h-4 w-4 mr-2" /> Add Mixer
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-slate-900 border-slate-700">
                <DialogHeader><DialogTitle>Add X32 Mixer</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="mixer-name-full">Name</Label>
                    <Input id="mixer-name-full" value={newMixer.name} onChange={(e) => setNewMixer({ ...newMixer, name: e.target.value })} placeholder="X32 Compact" className="bg-slate-800 border-slate-600" data-testid="input-mixer-name-full" />
                  </div>
                  <div>
                    <Label htmlFor="mixer-ip-full">IP Address</Label>
                    <Input id="mixer-ip-full" value={newMixer.ip} onChange={(e) => setNewMixer({ ...newMixer, ip: e.target.value })} placeholder="192.168.0.64" className="bg-slate-800 border-slate-600" data-testid="input-mixer-ip-full" />
                  </div>
                  <div>
                    <Label htmlFor="mixer-port-full">Port</Label>
                    <Input id="mixer-port-full" type="number" value={newMixer.port} onChange={(e) => setNewMixer({ ...newMixer, port: parseInt(e.target.value) || 10023 })} className="bg-slate-800 border-slate-600" data-testid="input-mixer-port-full" />
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
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Section Tabs */}
          <div className="border-b border-slate-800 bg-slate-950/30 px-6">
            <div className="flex gap-1 py-2">
              {SECTION_TABS.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveSection(tab.key)}
                  className={cn(
                    "px-4 py-2 rounded-md text-sm font-medium transition-colors",
                    activeSection === tab.key
                      ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                      : "text-slate-400 hover:text-white hover:bg-slate-800"
                  )}
                  data-testid={`tab-section-${tab.key}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Fader Section */}
          <div className="flex-1 overflow-auto p-6">
            <div className="flex gap-2 flex-wrap justify-center">
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

            {/* Main Fader */}
            <div className="mt-6 max-w-2xl mx-auto">
              <div className="flex items-center gap-4 p-4 bg-slate-800/50 rounded-lg border border-slate-600">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-cyan-400">MAIN LR</span>
                  <Button
                    variant={mainMuted ? "destructive" : "outline"}
                    size="sm"
                    onClick={handleMainMuteToggle}
                    data-testid="mute-main-full"
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
                  data-testid="fader-main-full"
                />
                <span className="text-xs font-mono text-slate-400 w-16 text-right">
                  {faderToDb(mainFader)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Mixer Dialog */}
      <Dialog open={editMixerOpen} onOpenChange={(open) => { setEditMixerOpen(open); if (!open) setConfirmDelete(false); }}>
        <DialogContent className="bg-slate-900 border-slate-700">
          <DialogHeader><DialogTitle>Mixer Settings</DialogTitle></DialogHeader>
          {!confirmDelete ? (
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-mixer-name-full">Name</Label>
                <Input id="edit-mixer-name-full" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="bg-slate-800 border-slate-600" data-testid="input-edit-mixer-name-full" />
              </div>
              <div>
                <Label htmlFor="edit-mixer-ip-full">IP Address</Label>
                <Input id="edit-mixer-ip-full" value={editForm.ip} onChange={(e) => setEditForm({ ...editForm, ip: e.target.value })} className="bg-slate-800 border-slate-600" data-testid="input-edit-mixer-ip-full" />
              </div>
              <div>
                <Label htmlFor="edit-mixer-port-full">Port</Label>
                <Input id="edit-mixer-port-full" type="number" value={editForm.port} onChange={(e) => setEditForm({ ...editForm, port: parseInt(e.target.value) || 10023 })} className="bg-slate-800 border-slate-600" data-testid="input-edit-mixer-port-full" />
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
                  <p className="text-white font-medium">Delete {mixer?.name}?</p>
                  <p className="text-sm text-slate-400">This will remove the mixer and disconnect.</p>
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
    </div>
  );
}

interface MixerChannelStripProps {
  channel: number;
  name: string;
  fader: number;
  muted: boolean;
  onFaderChange: (value: number) => void;
  onMuteToggle: (muted: boolean) => void;
}

function MixerChannelStrip({ channel, name, fader, muted, onFaderChange, onMuteToggle }: MixerChannelStripProps) {
  const [localFader, setLocalFader] = useState(fader);

  useEffect(() => {
    setLocalFader(fader);
  }, [fader]);

  const handleFaderChange = (value: number[]) => {
    const newValue = value[0];
    setLocalFader(newValue);
    onFaderChange(newValue);
  };

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 p-3 rounded-lg bg-slate-800/50 border border-slate-700 w-[72px]",
        muted && "opacity-60"
      )}
      data-testid={`mixer-strip-${channel}`}
    >
      <span className="text-[10px] text-slate-400 font-mono truncate w-full text-center" title={name}>
        {name}
      </span>

      <div className="h-40 flex items-center justify-center">
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

      <span className="text-[10px] text-slate-500 font-mono">
        {faderToDb(localFader)}
      </span>

      <Button
        variant={muted ? "destructive" : "outline"}
        size="sm"
        className="w-full h-7 text-[10px]"
        onClick={() => onMuteToggle(!muted)}
      >
        {muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
      </Button>

      <span className="text-xs font-bold text-slate-300">{channel}</span>
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
