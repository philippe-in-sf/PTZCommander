import React, { useState, useEffect } from "react";
import { Link } from "wouter";
import {
  Activity,
  Aperture,
  AudioLines,
  Camera,
  Clock,
  Crosshair,
  Database,
  Focus,
  Maximize,
  Radio,
  Terminal,
  Wifi
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DashboardSkinProps } from "./types";
import { Joystick } from "@/components/ptz/joystick";
import { SkinSelector } from "@/components/skin-selector";
import { ThemeToggle } from "@/components/theme-toggle";

// FAKE DATA for secondary panels
const TERMINAL_LOGS = [
  "[14:02:45] SYS: Connection established to 192.168.1.200",
  "[14:02:48] ATEM: Inputs synced (8 active)",
  "[14:03:12] CAM1: Preset 04 recalled (PAN: 145, TILT: -12)",
  "[14:05:00] MIXER: Channel 3 gain adjusted +2dB",
  "[14:05:05] WARN: CAM3 latency spike detected (120ms)",
  "[14:05:08] CAM3: Latency normalized (45ms)"
];

const SCENES = [
  { id: 1, name: "PRE-SHOW", status: "ready" },
  { id: 2, name: "WALK-IN", status: "ready" },
  { id: 3, name: "MAIN EVENT", status: "active" },
  { id: 4, name: "BAPTISM", status: "ready" },
  { id: 5, name: "ALTAR CALL", status: "ready" },
  { id: 6, name: "POST-SHOW", status: "ready" }
];

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
    onFocusAuto
  } = props;

  const [currentTime, setCurrentTime] = useState(new Date().toISOString().substring(11, 19));
  const [isStoreMode, setIsStoreMode] = useState(false);
  
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toISOString().substring(11, 19));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const PRESET_SLOTS = Array.from({ length: 16 }, (_, i) => {
    const preset = presets.find(p => p.presetNumber === i);
    return {
      index: i,
      name: preset ? (preset.name || `POS-${i.toString().padStart(2, '0')}`) : null,
      status: preset ? "saved" : "empty"
    };
  });

  return (
    <div className="min-h-screen bg-[#020617] text-slate-300 font-mono flex flex-col relative overflow-hidden selection:bg-amber-500/30">
      {/* Background Grid Pattern */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]" 
           style={{ backgroundImage: `linear-gradient(#334155 1px, transparent 1px), linear-gradient(90deg, #334155 1px, transparent 1px)`, backgroundSize: '40px 40px' }} />

      {/* HEADER / TOP NAV */}
      <header className="h-14 border-b border-slate-800 bg-[#0f172a]/80 backdrop-blur flex items-center justify-between px-4 z-50 shrink-0 relative">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 text-amber-500 font-bold tracking-widest text-lg">
            <Radio className="w-5 h-5 animate-pulse" />
            <span>PTZCOMMAND<span className="text-slate-600">_</span></span>
          </div>
          
          <nav className="hidden md:flex gap-1 bg-[#020617] p-1 rounded-full border border-slate-800">
            <Link href="/">
              <a className="px-4 py-1.5 text-xs font-semibold rounded-full transition-colors bg-amber-500/20 text-amber-400">
                DASHBOARD
              </a>
            </Link>
            <Link href="/scenes">
              <a className="px-4 py-1.5 text-xs font-semibold rounded-full transition-colors text-slate-400 hover:text-slate-200 hover:bg-slate-800/50">
                SCENES
              </a>
            </Link>
            <Link href="/macros">
              <a className="px-4 py-1.5 text-xs font-semibold rounded-full transition-colors text-slate-400 hover:text-slate-200 hover:bg-slate-800/50">
                MACROS
              </a>
            </Link>
            <Link href="/switcher">
              <a className="px-4 py-1.5 text-xs font-semibold rounded-full transition-colors text-slate-400 hover:text-slate-200 hover:bg-slate-800/50">
                VIDEO
              </a>
            </Link>
            <Link href="/mixer">
              <a className="px-4 py-1.5 text-xs font-semibold rounded-full transition-colors text-slate-400 hover:text-slate-200 hover:bg-slate-800/50">
                AUDIO
              </a>
            </Link>
            <Link href="/lighting">
              <a className="px-4 py-1.5 text-xs font-semibold rounded-full transition-colors text-slate-400 hover:text-slate-200 hover:bg-slate-800/50">
                LIGHTS
              </a>
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-6 text-xs">
          <div className="hidden lg:flex items-center gap-4 text-slate-500">
            <span className="flex items-center gap-1"><CpuIcon /> CPU: 12%</span>
            <span className="flex items-center gap-1"><Database className="w-3.5 h-3.5" /> MEM: 4.2GB</span>
            <span className="flex items-center gap-1"><Wifi className="w-3.5 h-3.5" /> NET: 1.2Gbps</span>
          </div>
          <div className="flex items-center gap-2 font-bold text-cyan-400 tracking-wider bg-cyan-950/30 px-3 py-1.5 rounded border border-cyan-900/50">
            <Clock className="w-4 h-4" />
            {currentTime} UTC
          </div>
          <div className="flex items-center gap-2 border border-green-900/50 bg-green-950/30 px-3 py-1.5 rounded text-green-400">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            SYSTEM ONLINE
          </div>
          <ThemeToggle />
          <SkinSelector />
        </div>
      </header>

      {/* MAIN LAYOUT */}
      <main className="flex-1 p-4 grid grid-cols-12 gap-4 z-10 overflow-y-auto">
        
        {/* LEFT COLUMN - Cameras & Presets (7 cols) */}
        <div className="col-span-12 lg:col-span-7 flex flex-col gap-4">
          
          {/* CAMERA STRIP */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {cameras.map(cam => {
              const isSelected = selectedCameraId === cam.id;
              const isProgram = cam.tallyState === 'program';
              const isPreview = cam.tallyState === 'preview';
              
              return (
                <div 
                  key={cam.id} 
                  onClick={() => onSelectCamera(cam.id)}
                  className={`relative p-3 rounded-sm border cursor-pointer transition-all ${
                    isSelected 
                      ? "border-amber-500 bg-amber-950/10 shadow-[0_0_15px_rgba(245,158,11,0.15)]" 
                      : "border-slate-800 bg-[#0f172a]/50 hover:border-slate-600"
                  }`}
                >
                  {/* Tally Bar */}
                  <div className={`absolute top-0 left-0 right-0 h-1 ${
                    isProgram ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]' : 
                    isPreview ? 'bg-green-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]' : 
                    'bg-slate-800'
                  }`} />
                  
                  <div className="mt-2 flex justify-between items-start mb-2">
                    <div className="font-bold text-slate-200 text-sm truncate pr-2">{cam.name}</div>
                    <Badge variant="outline" className={`text-[10px] uppercase px-1.5 py-0 h-4 rounded-none border-slate-700 ${isProgram ? 'text-red-400' : isPreview ? 'text-green-400' : 'text-slate-500'}`}>
                      {cam.tallyState || 'off'}
                    </Badge>
                  </div>
                  
                  <div className="space-y-1 mt-3">
                    <div className="flex justify-between text-[10px] text-slate-500">
                      <span>IP</span><span className="text-slate-400">{cam.ip}:{cam.port}</span>
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-500">
                      <span>STS</span>
                      <span className={cam.status === 'online' ? "text-green-400" : "text-slate-500"}>
                        {cam.status}
                      </span>
                    </div>
                  </div>
                  
                  {isSelected && (
                    <div className="absolute -bottom-px -right-px w-2 h-2 border-b-2 border-r-2 border-amber-500"></div>
                  )}
                </div>
              );
            })}
          </div>

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
                    variant="outline" 
                    size="icon" 
                    className="h-10 w-10 rounded-none border-slate-700 bg-slate-800/50 hover:bg-slate-700 hover:text-amber-400"
                  >
                    <Focus className="h-4 w-4" />
                  </Button>
                  <div className="flex-1 w-8 bg-slate-900 border border-slate-800 relative py-2 flex justify-center rounded-sm">
                     <div className="absolute left-0 top-0 bottom-0 w-1 flex flex-col justify-between py-2">
                      {[...Array(9)].map((_, i) => <div key={i} className="w-full h-px bg-slate-700"></div>)}
                    </div>
                  </div>
                  <Button 
                    variant="outline" 
                    size="icon" 
                    className="h-10 w-10 rounded-none border-slate-700 bg-slate-800/50 hover:bg-slate-700 hover:text-amber-400"
                  >
                    <Aperture className="h-4 w-4" />
                  </Button>
                  <Button 
                    onClick={() => onFocusAuto()}
                    variant="outline" 
                    className="h-6 text-[10px] px-2 rounded-none border-amber-900/50 bg-amber-950/30 text-amber-500 mt-1"
                  >
                    AUTO
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
              <div className="text-xs text-slate-500">PROGRAM (PGM)</div>
              <Badge className="bg-red-500/10 text-red-500 border-red-500/50 rounded-none text-[10px]">ON AIR</Badge>
            </div>
            
            <div className="grid grid-cols-8 gap-1 mb-4">
              {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                <button key={`pgm-${i}`} className={`
                  h-10 border rounded-sm flex items-center justify-center text-sm font-bold transition-colors
                  ${i === 1 ? 'bg-red-600 border-red-500 text-white shadow-[0_0_10px_rgba(220,38,38,0.6)]' : 'bg-slate-900 border-slate-800 text-slate-500 hover:bg-slate-800'}
                `}>
                  {i}
                </button>
              ))}
            </div>

            <div className="text-xs text-slate-500 mb-2">PREVIEW (PVW)</div>
            <div className="grid grid-cols-8 gap-1 mb-4">
              {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                <button key={`pvw-${i}`} className={`
                  h-10 border rounded-sm flex items-center justify-center text-sm font-bold transition-colors
                  ${i === 2 ? 'bg-green-600 border-green-500 text-white shadow-[0_0_10px_rgba(22,163,74,0.6)]' : 'bg-slate-900 border-slate-800 text-slate-500 hover:bg-slate-800'}
                `}>
                  {i}
                </button>
              ))}
            </div>
            
            <div className="flex gap-2 justify-end">
              <Button variant="outline" className="h-12 w-20 rounded-sm border-slate-600 bg-slate-800 font-bold text-slate-300 hover:bg-slate-700 hover:text-white">CUT</Button>
              <Button variant="outline" className="h-12 w-24 rounded-sm border-amber-600/50 bg-amber-950/30 font-bold text-amber-500 hover:bg-amber-900/50 hover:text-amber-400">AUTO</Button>
            </div>
          </div>

          {/* AUDIO MIXER PANEL */}
          <div className="border border-slate-800 bg-[#0f172a]/50 p-4 rounded-sm relative flex-1 min-h-[180px]">
             <div className="absolute top-0 left-0 px-2 py-0.5 bg-slate-800 text-[10px] text-slate-400">AUD_MATRIX</div>
             
             <div className="mt-4 flex gap-4 h-[120px]">
               {/* Channels */}
               {[
                 { id: "CH1", name: "MIC 1", level: 75, peak: false },
                 { id: "CH2", name: "MIC 2", level: 60, peak: false },
                 { id: "CH3", name: "INST", level: 85, peak: true },
                 { id: "MAIN", name: "MASTER", level: 80, peak: false, isMain: true }
               ].map((ch, i) => (
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
                         const colorClass = segmentLevel > 85 ? (ch.peak && isActive ? 'bg-red-500' : 'bg-red-900/40') : 
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
          </div>

        </div>

        {/* BOTTOM TERMINAL ROW (12 cols) */}
        <div className="col-span-12 border border-slate-800 bg-black p-3 rounded-sm relative mt-2 h-32 flex flex-col font-mono">
          <div className="absolute top-0 right-0 px-2 py-0.5 bg-slate-800 text-[10px] text-slate-400 flex items-center gap-1">
            <Terminal className="w-3 h-3" /> SYS_LOG
          </div>
          
          <div className="flex-1 overflow-y-auto mt-2 text-[11px] leading-relaxed tracking-wider space-y-1">
            {TERMINAL_LOGS.map((log, i) => (
              <div key={i} className="flex">
                <span className={`${
                  log.includes("WARN") ? "text-amber-500" :
                  log.includes("SYS") ? "text-cyan-500" :
                  log.includes("ATEM") ? "text-purple-400" :
                  "text-slate-400"
                }`}>
                  {log}
                </span>
              </div>
            ))}
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
