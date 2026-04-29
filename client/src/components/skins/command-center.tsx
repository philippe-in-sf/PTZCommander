import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Activity,
  AudioLines,
  Camera,
  Clock,
  Crosshair,
  Database,
  ChevronDown,
  Maximize,
  Radio,
  Terminal,
  Wifi
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DashboardSkinProps } from "./types";
import { BrandLogo, BrandWatermark } from "@/components/branding/brand";
import { Joystick } from "@/components/ptz/joystick";
import { CameraPreview } from "@/components/ptz/camera-preview";
import { SkinSelector } from "@/components/skin-selector";
import { ThemeToggle } from "@/components/theme-toggle";
import { RehearsalToggle } from "@/components/rehearsal-toggle";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { healthApi, mixerApi, type DeviceHealthResponse, type SystemHealthResponse } from "@/lib/api";
import { useAtemControl } from "@/hooks/use-atem-control";
import { cn } from "@/lib/utils";

type RecentLog = {
  timestamp?: string | number;
  level?: string;
  category?: string;
  message?: string;
};

type MixerLiveChannel = {
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

const SCENES = [
  { id: 1, name: "PRE-SHOW", status: "ready" },
  { id: 2, name: "WALK-IN", status: "ready" },
  { id: 3, name: "MAIN EVENT", status: "active" },
  { id: 4, name: "BAPTISM", status: "ready" },
  { id: 5, name: "ALTAR CALL", status: "ready" },
  { id: 6, name: "POST-SHOW", status: "ready" }
];

async function fetchRecentLogs(): Promise<RecentLog[]> {
  const res = await fetch("/api/logs/recent");
  if (!res.ok) throw new Error("Failed to fetch recent logs");
  return res.json();
}

function mixerChannelKey(section: string, channel: number) {
  return `${section}:${channel}`;
}

export default function CommandCenter(props: DashboardSkinProps) {
  const {
    cameras,
    selectedCameraId,
    selectedCamera,
    onSelectCamera,
    presets,
    onRecallPreset,
    onStorePreset,
    onJoystickMove,
    onJoystickStop,
    onZoom,
    onFocusAuto,
    ws,
  } = props;

  const { atemState, switcher, displayInputs, cut, auto, setProgramInput, setPreviewInput } = useAtemControl();
  const [currentTime, setCurrentTime] = useState(() => {
    return new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone: "America/Chicago",
      timeZoneName: "short",
    }).format(new Date());
  });
  const [isStoreMode, setIsStoreMode] = useState(false);
  const [wsConnected, setWsConnected] = useState(() => ws.isConnected());
  const [mixerChannelsByKey, setMixerChannelsByKey] = useState<Map<string, MixerLiveChannel>>(new Map());
  const { data: recentLogs = [], isError: logsError } = useQuery<RecentLog[]>({
    queryKey: ["/api/logs/recent"],
    queryFn: fetchRecentLogs,
    refetchInterval: 5000,
  });
  const { data: deviceHealth } = useQuery<DeviceHealthResponse>({
    queryKey: ["health-devices"],
    queryFn: healthApi.getDevices,
    refetchInterval: 5000,
  });
  const { data: systemHealth } = useQuery<SystemHealthResponse>({
    queryKey: ["health-system"],
    queryFn: healthApi.getSystem,
    refetchInterval: 10000,
  });
  const { data: mixers = [] } = useQuery({
    queryKey: ["mixers"],
    queryFn: mixerApi.getAll,
  });
  const mixer = mixers[0] ?? null;
  const { data: mixerStatus } = useQuery<MixerStatusResponse>({
    queryKey: ["control-center-mixer-status", mixer?.id],
    queryFn: () => mixerApi.getStatus(mixer!.id),
    enabled: !!mixer,
    refetchInterval: mixer?.status === "online" ? 5000 : false,
  });
  
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Intl.DateTimeFormat("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
        timeZone: "America/Chicago",
        timeZoneName: "short",
      }).format(new Date()));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleConnection = (connected: boolean) => setWsConnected(connected);
    setWsConnected(ws.isConnected());
    ws.addConnectionHandler(handleConnection);
    return () => ws.removeConnectionHandler(handleConnection);
  }, [ws]);

  const PRESET_SLOTS = Array.from({ length: 16 }, (_, i) => {
    const preset = presets.find(p => p.presetNumber === i);
    return {
      index: i,
      name: preset ? (preset.name || `POS-${i.toString().padStart(2, '0')}`) : null,
      status: preset ? "saved" : "empty"
    };
  });

  const terminalLogs = recentLogs.slice(-8);
  const routedInputs = displayInputs.slice(0, 8);
  const totalDevices = (deviceHealth?.cameras.length || 0)
    + (deviceHealth?.mixers.length || 0)
    + (deviceHealth?.switchers.length || 0)
    + (deviceHealth?.displays.length || 0);
  const onlineDevices = [
    ...(deviceHealth?.cameras || []),
    ...(deviceHealth?.mixers || []),
    ...(deviceHealth?.switchers || []),
    ...(deviceHealth?.displays || []),
  ].filter((device) => device.status === "online").length;

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

  const mixerStripData = [
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
  }));

  const formatLogTimestamp = (value?: string | number) => {
    if (!value) return "--:--:--";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "--:--:--";
    return date.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZone: "UTC",
    });
  };

  const formatMemoryGb = (bytes?: number) => {
    if (!bytes || bytes < 0) return "--";
    return (bytes / (1024 ** 3)).toFixed(1);
  };

  const formatMbps = (value?: number) => {
    if (value === undefined || !Number.isFinite(value)) return "--";
    return value >= 100 ? `${Math.round(value)}` : value >= 10 ? value.toFixed(1) : value.toFixed(2);
  };

  const cpuLabel = systemHealth ? `${Math.round(systemHealth.cpuPercent)}%` : "--";
  const memoryLabel = systemHealth
    ? `${formatMemoryGb(systemHealth.usedMemoryBytes)}/${formatMemoryGb(systemHealth.totalMemoryBytes)}GB`
    : "--";
  const networkLabel = systemHealth
    ? `RX ${formatMbps(systemHealth.network.rxMbps)} / TX ${formatMbps(systemHealth.network.txMbps)} Mbps`
    : totalDevices > 0
      ? `${onlineDevices}/${totalDevices} LINKS`
      : wsConnected
        ? "WS LINK"
        : "WS DOWN";

  return (
    <div className="min-h-screen bg-[#020617] text-slate-300 font-mono flex flex-col relative overflow-hidden selection:bg-amber-500/30">
      {/* Background Grid Pattern */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]" 
           style={{ backgroundImage: `linear-gradient(#334155 1px, transparent 1px), linear-gradient(90deg, #334155 1px, transparent 1px)`, backgroundSize: '40px 40px' }} />
      <BrandWatermark className="bottom-5 right-5 opacity-[0.12]" />

      {/* HEADER / TOP NAV */}
      <header className="h-14 border-b border-slate-800 bg-[#0f172a]/80 backdrop-blur flex items-center justify-between px-4 z-50 shrink-0 relative">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <BrandLogo imageClassName="h-8 w-auto" />
          </div>
          
          <nav className="hidden md:flex gap-1 bg-[#020617] p-1 rounded-full border border-slate-800">
            <Link href="/" className="px-4 py-1.5 text-xs font-semibold rounded-full transition-colors bg-amber-500/20 text-amber-400">
              DASHBOARD
            </Link>
            <Link href="/scenes" className="px-4 py-1.5 text-xs font-semibold rounded-full transition-colors text-slate-400 hover:text-slate-200 hover:bg-slate-800/50">
              SCENES
            </Link>
            <Link href="/runsheet" className="px-4 py-1.5 text-xs font-semibold rounded-full transition-colors text-slate-400 hover:text-slate-200 hover:bg-slate-800/50">
              RUN
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="px-4 py-1.5 text-xs font-semibold rounded-full transition-colors text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 inline-flex items-center">
                  PROD
                  <ChevronDown className="w-3 h-3 ml-1" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="min-w-[12rem] border-slate-700 bg-[#0b1220] text-slate-100 shadow-2xl shadow-black/40"
              >
                <DropdownMenuItem asChild>
                  <Link href="/switcher" className="cursor-pointer font-semibold tracking-wide text-slate-100 hover:text-amber-300">VIDEO</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/mixer" className="cursor-pointer font-semibold tracking-wide text-slate-100 hover:text-amber-300">AUDIO</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/lighting" className="cursor-pointer font-semibold tracking-wide text-slate-100 hover:text-amber-300">LIGHTS</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/displays" className="cursor-pointer font-semibold tracking-wide text-slate-100 hover:text-amber-300">DISPLAYS</Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="px-4 py-1.5 text-xs font-semibold rounded-full transition-colors text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 inline-flex items-center">
                  TOOLS
                  <ChevronDown className="w-3 h-3 ml-1" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="min-w-[12rem] border-slate-700 bg-[#0b1220] text-slate-100 shadow-2xl shadow-black/40"
              >
                <DropdownMenuItem asChild>
                  <Link href="/macros" className="cursor-pointer font-semibold tracking-wide text-slate-100 hover:text-amber-300">MACROS</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/diagnostics" className="cursor-pointer font-semibold tracking-wide text-slate-100 hover:text-amber-300">DIAG</Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </nav>
        </div>

        <div className="flex items-center gap-6 text-xs">
          <RehearsalToggle />
          <div className="hidden lg:flex items-center gap-4 text-slate-500">
            <span className="flex items-center gap-1"><CpuIcon /> CPU: {cpuLabel}</span>
            <span className="flex items-center gap-1"><Database className="w-3.5 h-3.5" /> MEM: {memoryLabel}</span>
            <span className="flex items-center gap-1"><Wifi className="w-3.5 h-3.5" /> NET: {networkLabel}</span>
          </div>
          <div className="flex items-center gap-2 font-bold text-cyan-400 tracking-wider bg-cyan-950/30 px-3 py-1.5 rounded border border-cyan-900/50">
            <Clock className="w-4 h-4" />
            {currentTime}
          </div>
          <div className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded border",
            wsConnected
              ? "border-green-900/50 bg-green-950/30 text-green-400"
              : "border-red-900/50 bg-red-950/30 text-red-400"
          )}>
            <span className="relative flex h-2 w-2">
              <span className={cn(
                "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
                wsConnected ? "bg-green-400" : "bg-red-400"
              )}></span>
              <span className={cn(
                "relative inline-flex rounded-full h-2 w-2",
                wsConnected ? "bg-green-500" : "bg-red-500"
              )}></span>
            </span>
            {wsConnected ? "SYSTEM ONLINE" : "SYSTEM OFFLINE"}
          </div>
          <ThemeToggle />
          <SkinSelector />
        </div>
      </header>

      {/* MAIN LAYOUT */}
      <main className="flex-1 p-4 grid grid-cols-12 gap-4 z-10 overflow-y-auto">
        
        {/* LEFT COLUMN - Cameras & Presets (7 cols) */}
        <div className="col-span-12 lg:col-span-7 flex flex-col gap-4">
          <CameraPreview
            cameras={cameras}
            selectedId={selectedCameraId}
            onSelect={onSelectCamera}
          />

          <div className="grid grid-cols-12 gap-4 flex-1 min-h-0">
            {/* PTZ CONTROL PANEL (7 cols) */}
            <div className="col-span-12 md:col-span-7 border border-slate-800 bg-[#0f172a]/50 p-4 rounded-sm flex flex-col relative">
              <div className="absolute top-0 left-0 px-2 py-0.5 bg-slate-800 text-[10px] text-slate-400">CTRL_INTERFACE</div>
              
              <div className="flex justify-between items-center mb-6 mt-2">
                <div className="text-sm text-cyan-400 font-bold tracking-widest flex items-center gap-2">
                  <Crosshair className="w-4 h-4" />
                  MANUAL_OVERRIDE
                </div>
                <div className="flex gap-2">
                  <Badge className="bg-slate-800 text-slate-300 rounded-none border-0 text-[10px]">CAM: {selectedCamera?.name || 'NONE'}</Badge>
                </div>
              </div>

              <div className="flex-1 flex items-center justify-center py-4">
                <div className="relative w-48 h-48 rounded-full border border-slate-700 bg-slate-900/50 shadow-[inset_0_0_20px_rgba(0,0,0,0.5)] flex items-center justify-center">
                  <Joystick 
                    onMove={onJoystickMove} 
                    onStop={onJoystickStop} 
                    className="w-full h-full border-none shadow-none bg-transparent !shadow-none [&>div:last-child]:hidden [&>div:first-child]:hidden" 
                  />
                  {/* Crosshairs underneath the transparent joystick */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
                    <div className="w-full h-px bg-cyan-500"></div>
                    <div className="absolute h-full w-px bg-cyan-500"></div>
                  </div>
                  <div className="absolute top-2 text-[10px] text-slate-500 pointer-events-none">UP</div>
                  <div className="absolute bottom-2 text-[10px] text-slate-500 pointer-events-none">DN</div>
                  <div className="absolute left-2 text-[10px] text-slate-500 pointer-events-none">L</div>
                  <div className="absolute right-2 text-[10px] text-slate-500 pointer-events-none">R</div>
                </div>
              </div>

              {/* Data Readout */}
              <div className="flex justify-between px-4 py-2 bg-slate-900 border border-slate-800 rounded text-xs text-amber-500 font-bold tracking-widest mt-4">
                <span>PAN: <span className="text-slate-300">ACTV</span></span>
                <span>TILT: <span className="text-slate-300">ACTV</span></span>
              </div>
            </div>

            {/* LENS CONTROLS (5 cols) */}
            <div className="col-span-12 md:col-span-5 border border-slate-800 bg-[#0f172a]/50 p-4 rounded-sm flex flex-col relative">
              <div className="absolute top-0 left-0 px-2 py-0.5 bg-slate-800 text-[10px] text-slate-400">LENS_CTRL</div>
              
              <div className="flex-1 flex gap-6 mt-4 justify-center py-4">
                {/* ZOOM CONTROLS */}
                <div className="flex flex-col items-center gap-3">
                  <div className="text-[10px] text-slate-400 font-bold tracking-widest">ZOOM</div>
                  <Button 
                    onMouseDown={() => onZoom(1)} 
                    onMouseUp={() => onZoom(0)} 
                    onMouseLeave={() => onZoom(0)}
                    variant="outline" 
                    size="icon" 
                    className="h-10 w-10 rounded-none border-slate-700 bg-slate-800/50 hover:bg-slate-700 hover:text-amber-400 active:bg-amber-500/20 active:border-amber-500 active:text-amber-400"
                  >
                    <Maximize className="h-4 w-4" />
                  </Button>
                  <div className="flex-1 w-8 bg-slate-900 border border-slate-800 relative py-2 flex justify-center rounded-sm">
                    <div className="absolute left-0 top-0 bottom-0 w-1 flex flex-col justify-between py-2">
                      {[...Array(9)].map((_, i) => <div key={i} className="w-full h-px bg-slate-700"></div>)}
                    </div>
                  </div>
                  <Button 
                    onMouseDown={() => onZoom(-1)} 
                    onMouseUp={() => onZoom(0)} 
                    onMouseLeave={() => onZoom(0)}
                    variant="outline" 
                    size="icon" 
                    className="h-10 w-10 rounded-none border-slate-700 bg-slate-800/50 hover:bg-slate-700 hover:text-amber-400 active:bg-amber-500/20 active:border-amber-500 active:text-amber-400"
                  >
                    <ZoomOutIcon />
                  </Button>
                </div>

                {/* FOCUS CONTROLS */}
                <div className="flex flex-col items-center gap-3">
                  <div className="text-[10px] text-slate-400 font-bold tracking-widest">FOCUS</div>
                  <Button 
                    onClick={() => onFocusAuto()}
                    variant="outline" 
                    className="h-10 min-w-[5rem] text-[10px] px-3 rounded-none border-amber-900/50 bg-amber-950/30 text-amber-500 mt-1"
                  >
                    AUTO FOCUS
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* PRESETS GRID */}
          <div className="border border-slate-800 bg-[#0f172a]/50 p-4 rounded-sm relative mt-auto">
            <div className="absolute top-0 left-0 px-2 py-0.5 bg-slate-800 text-[10px] text-slate-400">MEM_BANKS</div>
            <div className="flex justify-between items-center mb-3 mt-1">
              <div className="text-xs text-slate-400 flex items-center gap-2">
                <Database className="w-3.5 h-3.5" />
                <span>BANK A (0-15)</span>
              </div>
              <div className="flex gap-1">
                <Button 
                  onClick={() => setIsStoreMode(!isStoreMode)}
                  variant="outline" 
                  size="sm" 
                  className={`h-6 text-[10px] rounded-none border-slate-700 ${isStoreMode ? 'bg-red-900/50 text-red-400 border-red-500' : 'bg-slate-800 text-slate-300'}`}
                >
                  {isStoreMode ? 'STORING...' : 'STORE'}
                </Button>
                <Button 
                  onClick={() => setIsStoreMode(false)}
                  variant="outline" 
                  size="sm" 
                  className={`h-6 text-[10px] rounded-none border-slate-700 ${!isStoreMode ? 'bg-slate-700 text-white' : 'bg-slate-800 text-slate-300'}`}
                >
                  RECALL
                </Button>
              </div>
            </div>
            
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
              {PRESET_SLOTS.map(p => (
                <button 
                  key={p.index}
                  onClick={() => {
                    if (isStoreMode) {
                      onStorePreset(p.index);
                      setIsStoreMode(false);
                    } else {
                      onRecallPreset(p.index);
                    }
                  }}
                  className={`
                    relative h-12 flex flex-col items-center justify-center border rounded-sm transition-all
                    ${isStoreMode 
                      ? 'border-red-500/50 hover:bg-red-900/20 text-slate-300 hover:border-red-500'
                      : p.status === 'saved' ? 'border-slate-600 bg-slate-800/40 text-slate-300 hover:border-amber-500 hover:text-amber-400' : 
                      'border-slate-800 bg-[#020617]/50 text-slate-600 hover:border-slate-700'}
                  `}
                >
                  <span className="text-sm font-bold">{p.index.toString().padStart(2, '0')}</span>
                  {p.status !== 'empty' && (
                    <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-cyan-500"></div>
                  )}
                  {p.status !== 'empty' && (
                    <span className="text-[8px] absolute bottom-1 truncate w-full px-1 text-center opacity-70">{p.name}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN - Switcher, Audio, Macros (5 cols) */}
        <div className="col-span-12 lg:col-span-5 flex flex-col gap-4">
          
          {/* SCENE MACROS */}
          <div className="border border-slate-800 bg-[#0f172a]/50 p-3 rounded-sm relative">
            <div className="absolute top-0 left-0 px-2 py-0.5 bg-slate-800 text-[10px] text-slate-400">SEQ_EXEC</div>
            <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-2">
              {SCENES.map(scene => (
                <button 
                  key={scene.id}
                  className={`
                    h-10 text-xs font-bold tracking-wider rounded-sm border transition-all flex items-center justify-center gap-2
                    ${scene.status === 'active' 
                      ? 'border-red-500 bg-red-950/30 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.2)]' 
                      : 'border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-700 hover:border-slate-500'}
                  `}
                >
                  {scene.status === 'active' && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>}
                  {scene.name}
                </button>
              ))}
            </div>
          </div>

          {/* SWITCHER PANEL */}
          <div className="border border-slate-800 bg-[#0f172a]/50 p-4 rounded-sm relative">
            <div className="absolute top-0 left-0 px-2 py-0.5 bg-slate-800 text-[10px] text-slate-400">VID_ROUTER</div>
            
            <div className="mt-3 flex justify-between items-end mb-2">
              <div className="text-xs text-slate-500">
                {switcher ? `PROGRAM (PGM) · ${switcher.name}` : "PROGRAM (PGM) · NO SWITCHER"}
              </div>
              <Badge className={cn(
                "rounded-none border text-[10px]",
                atemState.connected
                  ? "bg-red-500/10 text-red-500 border-red-500/50"
                  : "bg-slate-800 text-slate-400 border-slate-700"
              )}>
                {atemState.connected ? "ON AIR" : switcher ? "OFFLINE" : "NOT CONFIGURED"}
              </Badge>
            </div>
            
            <div className="grid grid-cols-8 gap-1 mb-4">
              {routedInputs.map((input) => (
                <button
                  key={`pgm-${input.inputId}`}
                  onClick={() => atemState.connected && setProgramInput(input.inputId)}
                  disabled={!atemState.connected}
                  className={`
                  h-10 border rounded-sm flex items-center justify-center text-sm font-bold transition-colors
                  ${atemState.programInput === input.inputId ? 'bg-red-600 border-red-500 text-white shadow-[0_0_10px_rgba(220,38,38,0.6)]' : 'bg-slate-900 border-slate-800 text-slate-500 hover:bg-slate-800'}
                  ${!atemState.connected ? 'cursor-not-allowed opacity-40' : ''}
                `}
                >
                  {input.shortName || input.inputId}
                </button>
              ))}
            </div>

            <div className="text-xs text-slate-500 mb-2">PREVIEW (PVW)</div>
            <div className="grid grid-cols-8 gap-1 mb-4">
              {routedInputs.map((input) => (
                <button
                  key={`pvw-${input.inputId}`}
                  onClick={() => atemState.connected && setPreviewInput(input.inputId)}
                  disabled={!atemState.connected}
                  className={`
                  h-10 border rounded-sm flex items-center justify-center text-sm font-bold transition-colors
                  ${atemState.previewInput === input.inputId ? 'bg-green-600 border-green-500 text-white shadow-[0_0_10px_rgba(22,163,74,0.6)]' : 'bg-slate-900 border-slate-800 text-slate-500 hover:bg-slate-800'}
                  ${!atemState.connected ? 'cursor-not-allowed opacity-40' : ''}
                `}
                >
                  {input.shortName || input.inputId}
                </button>
              ))}
            </div>
            
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={cut}
                disabled={!atemState.connected}
                className="h-12 w-20 rounded-sm border-slate-600 bg-slate-800 font-bold text-slate-300 hover:bg-slate-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                CUT
              </Button>
              <Button
                variant="outline"
                onClick={auto}
                disabled={!atemState.connected}
                className={cn(
                  "h-12 w-24 rounded-sm border-amber-600/50 bg-amber-950/30 font-bold text-amber-500 hover:bg-amber-900/50 hover:text-amber-400 disabled:cursor-not-allowed disabled:opacity-40",
                  atemState.inTransition && "bg-amber-700/50"
                )}
              >
                AUTO
              </Button>
            </div>
          </div>

          {/* AUDIO MIXER PANEL */}
          <div className="border border-slate-800 bg-[#0f172a]/50 p-4 rounded-sm relative flex-1 min-h-[180px]">
             <div className="absolute top-0 left-0 px-2 py-0.5 bg-slate-800 text-[10px] text-slate-400">AUD_MATRIX</div>
             
             <div className="mt-4 flex gap-4 h-[120px]">
               {/* Channels */}
               {mixerStripData.map((ch) => (
                 <div key={ch.id} className={`flex-1 flex flex-col items-center gap-2 ${ch.isMain ? 'border-l border-slate-800 pl-4 ml-2' : ''}`}>
                   <div className="text-[9px] text-slate-500 truncate w-full text-center">{ch.name}</div>
                   
                   {/* Meter */}
                   <div className="flex-1 w-4 bg-slate-900 border border-slate-800 rounded-sm p-[2px] flex flex-col justify-end overflow-hidden relative">
                     {/* Scale markings */}
                     <div className="absolute -left-3 top-0 bottom-0 flex flex-col justify-between py-1 opacity-50">
                       <span className="text-[6px] text-red-500">0</span>
                       <span className="text-[6px] text-amber-500">-10</span>
                       <span className="text-[6px] text-green-500">-20</span>
                       <span className="text-[6px] text-slate-500">-40</span>
                     </div>
                     
                     <div className="w-full flex flex-col gap-[1px]">
                       {/* Simulate segments based on level */}
                       {[...Array(20)].map((_, idx) => {
                         const segmentLevel = 100 - (idx * 5);
                         const isActive = ch.level >= segmentLevel;
                         const colorClass = ch.muted ? (isActive ? 'bg-slate-500/50' : 'bg-slate-800') :
                                            segmentLevel > 85 ? (ch.peak && isActive ? 'bg-red-500' : 'bg-red-900/40') : 
                                            segmentLevel > 65 ? (isActive ? 'bg-amber-500' : 'bg-amber-900/40') : 
                                            (isActive ? 'bg-green-500' : 'bg-green-900/40');
                         
                         return <div key={idx} className={`h-1 w-full rounded-[1px] ${colorClass}`}></div>
                       })}
                     </div>
                   </div>
                   
                   <div className={`text-[10px] font-bold ${ch.isMain ? 'text-amber-500' : 'text-slate-400'}`}>{ch.id}</div>
                 </div>
               ))}
             </div>
             <div className="mt-3 flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-slate-500">
               <span>{mixer ? mixer.name : "No mixer configured"}</span>
               <span>{mixer?.status === "online" ? "Live" : mixer ? mixer.status : "Offline"}</span>
             </div>
          </div>

        </div>

        {/* BOTTOM TERMINAL ROW (12 cols) */}
        <div className="col-span-12 border border-slate-800 bg-black p-3 rounded-sm relative mt-2 h-32 flex flex-col font-mono">
          <div className="absolute top-0 right-0 px-2 py-0.5 bg-slate-800 text-[10px] text-slate-400 flex items-center gap-1">
            <Terminal className="w-3 h-3" /> SYS_LOG
          </div>
          
          <div className="flex-1 overflow-y-auto mt-2 text-[11px] leading-relaxed tracking-wider space-y-1">
            {terminalLogs.map((log, i) => (
              <div key={i} className="flex">
                <span className={`${
                  log.level === "error" ? "text-red-400" :
                  log.level === "warn" ? "text-amber-500" :
                  log.category === "system" ? "text-cyan-500" :
                  log.category === "switcher" ? "text-purple-400" :
                  "text-slate-400"
                }`}>
                  [{formatLogTimestamp(log.timestamp)}] {(log.category || "system").toUpperCase()}: {log.message || "No message"}
                </span>
              </div>
            ))}
            {terminalLogs.length === 0 && !logsError && (
              <div className="flex text-slate-500">
                <span>[--:--:--] SYS: Awaiting recent log activity...</span>
              </div>
            )}
            {logsError && (
              <div className="flex text-red-400">
                <span>[--:--:--] SYS: Failed to load recent logs</span>
              </div>
            )}
            <div className="flex items-center text-green-500 mt-1">
              <span>root@ptz-command:~# </span>
              <span className="w-2 h-3 bg-green-500 ml-1 animate-pulse"></span>
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}

// Helper icons
function CpuIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="16" height="16" x="4" y="4" rx="2" />
      <rect width="6" height="6" x="9" y="9" rx="1" />
      <path d="M15 2v2" />
      <path d="M15 20v2" />
      <path d="M2 15h2" />
      <path d="M2 9h2" />
      <path d="M20 15h2" />
      <path d="M20 9h2" />
      <path d="M9 2v2" />
      <path d="M9 20v2" />
    </svg>
  );
}

function ZoomOutIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" x2="16.65" y1="21" y2="16.65" />
      <line x1="8" x2="14" y1="11" y2="11" />
    </svg>
  );
}
