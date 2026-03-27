import React, { useState, useEffect } from "react";
import {
  Activity,
  Aperture,
  AudioLines,
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Circle,
  Clock,
  Crosshair,
  Database,
  Eye,
  Focus,
  Grip,
  Layers,
  Lightbulb,
  Maximize,
  Mic,
  Monitor,
  Power,
  Radio,
  RefreshCw,
  Settings,
  Signal,
  Sliders,
  Terminal,
  Video,
  Volume2,
  Wifi,
  Zap
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// FAKE DATA
const CAMERAS = [
  { id: "cam1", name: "Stage Left", ip: "192.168.1.101", proto: "VISCA/UDP", fps: "59.94p", latency: "12ms", state: "program", tally: "red" },
  { id: "cam2", name: "Stage Right", ip: "192.168.1.102", proto: "VISCA/TCP", fps: "59.94p", latency: "14ms", state: "preview", tally: "green" },
  { id: "cam3", name: "Pulpit", ip: "192.168.1.103", proto: "NDI/HX", fps: "29.97p", latency: "45ms", state: "idle", tally: "none" },
  { id: "cam4", name: "Wide Shot", ip: "192.168.1.104", proto: "SRT", fps: "59.94p", latency: "18ms", state: "idle", tally: "none" },
];

const PRESETS = Array.from({ length: 16 }, (_, i) => ({
  id: i + 1,
  name: `POS-${(i + 1).toString().padStart(2, '0')}`,
  status: Math.random() > 0.8 ? "empty" : (Math.random() > 0.9 ? "active" : "saved")
}));

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

export function CommandCenter() {
  const [activeCam, setActiveCam] = useState("cam1");
  const [currentTime, setCurrentTime] = useState(new Date().toISOString().substring(11, 19));
  
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toISOString().substring(11, 19));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen bg-[#020617] text-slate-300 font-mono flex flex-col relative overflow-hidden selection:bg-amber-500/30">
      {/* Background Grid Pattern */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]" 
           style={{ backgroundImage: `linear-gradient(#334155 1px, transparent 1px), linear-gradient(90deg, #334155 1px, transparent 1px)`, backgroundSize: '40px 40px' }} />

      {/* HEADER / TOP NAV */}
      <header className="h-14 border-b border-slate-800 bg-[#0f172a]/80 backdrop-blur flex items-center justify-between px-4 z-10 shrink-0">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 text-amber-500 font-bold tracking-widest text-lg">
            <Radio className="w-5 h-5 animate-pulse" />
            <span>PTZCOMMAND<span className="text-slate-600">_</span></span>
          </div>
          
          <nav className="hidden md:flex gap-1 bg-[#020617] p-1 rounded-full border border-slate-800">
            {["DASHBOARD", "SCENES", "MACROS", "VIDEO", "AUDIO", "LIGHTS"].map((tab, i) => (
              <button key={tab} className={`px-4 py-1.5 text-xs font-semibold rounded-full transition-colors ${i === 0 ? "bg-amber-500/20 text-amber-400" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"}`}>
                {tab}
              </button>
            ))}
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
        </div>
      </header>

      {/* MAIN LAYOUT */}
      <main className="flex-1 p-4 grid grid-cols-12 gap-4 z-10 overflow-y-auto">
        
        {/* LEFT COLUMN - Cameras & Presets (7 cols) */}
        <div className="col-span-12 lg:col-span-7 flex flex-col gap-4">
          
          {/* CAMERA STRIP */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {CAMERAS.map(cam => (
              <div 
                key={cam.id} 
                onClick={() => setActiveCam(cam.id)}
                className={`relative p-3 rounded-sm border cursor-pointer transition-all ${
                  activeCam === cam.id 
                    ? "border-amber-500 bg-amber-950/10 shadow-[0_0_15px_rgba(245,158,11,0.15)]" 
                    : "border-slate-800 bg-[#0f172a]/50 hover:border-slate-600"
                }`}
              >
                {/* Tally Bar */}
                <div className={`absolute top-0 left-0 right-0 h-1 ${
                  cam.tally === 'red' ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]' : 
                  cam.tally === 'green' ? 'bg-green-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]' : 
                  'bg-slate-800'
                }`} />
                
                <div className="mt-2 flex justify-between items-start mb-2">
                  <div className="font-bold text-slate-200 text-sm truncate pr-2">{cam.name}</div>
                  <Badge variant="outline" className={`text-[10px] uppercase px-1.5 py-0 h-4 rounded-none border-slate-700 ${cam.tally === 'red' ? 'text-red-400' : cam.tally === 'green' ? 'text-green-400' : 'text-slate-500'}`}>
                    {cam.state}
                  </Badge>
                </div>
                
                <div className="space-y-1 mt-3">
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span>IP</span><span className="text-slate-400">{cam.ip}</span>
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span>FMT</span><span className="text-slate-400">{cam.fps}</span>
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span>LAT</span><span className={parseInt(cam.latency) > 30 ? "text-amber-400" : "text-slate-400"}>{cam.latency}</span>
                  </div>
                </div>
                
                {activeCam === cam.id && (
                  <div className="absolute -bottom-px -right-px w-2 h-2 border-b-2 border-r-2 border-amber-500"></div>
                )}
              </div>
            ))}
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
                  <Badge className="bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-none border-0 text-[10px]">SPD: FAST</Badge>
                  <Badge className="bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-none border-0 text-[10px]">MODE: REL</Badge>
                </div>
              </div>

              <div className="flex-1 flex items-center justify-center py-4">
                {/* VIRTUAL JOYSTICK */}
                <div className="relative w-48 h-48 rounded-full border border-slate-700 bg-slate-900/50 shadow-[inset_0_0_20px_rgba(0,0,0,0.5)] flex items-center justify-center">
                  {/* Crosshairs */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
                    <div className="w-full h-px bg-cyan-500"></div>
                    <div className="absolute h-full w-px bg-cyan-500"></div>
                  </div>
                  
                  {/* Compass markers */}
                  <div className="absolute top-2 text-[10px] text-slate-500">UP</div>
                  <div className="absolute bottom-2 text-[10px] text-slate-500">DN</div>
                  <div className="absolute left-2 text-[10px] text-slate-500">L</div>
                  <div className="absolute right-2 text-[10px] text-slate-500">R</div>

                  {/* Puck */}
                  <div className="w-16 h-16 rounded-full border border-amber-500/50 bg-amber-950/40 shadow-[0_0_15px_rgba(245,158,11,0.2)] flex items-center justify-center relative cursor-move hover:bg-amber-900/60 transition-colors">
                    <div className="w-4 h-4 rounded-full bg-amber-500/80"></div>
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[3px] border-l-transparent border-r-[3px] border-r-transparent border-b-[4px] border-b-amber-500"></div>
                    <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[3px] border-l-transparent border-r-[3px] border-r-transparent border-t-[4px] border-t-amber-500"></div>
                    <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-0 h-0 border-t-[3px] border-t-transparent border-b-[3px] border-b-transparent border-r-[4px] border-r-amber-500"></div>
                    <div className="absolute -right-3 top-1/2 -translate-y-1/2 w-0 h-0 border-t-[3px] border-t-transparent border-b-[3px] border-b-transparent border-l-[4px] border-l-amber-500"></div>
                  </div>
                </div>
              </div>

              {/* Data Readout */}
              <div className="flex justify-between px-4 py-2 bg-slate-900 border border-slate-800 rounded text-xs text-amber-500 font-bold tracking-widest mt-4">
                <span>PAN: <span className="text-slate-300">+045.2°</span></span>
                <span>TILT: <span className="text-slate-300">-012.8°</span></span>
              </div>
            </div>

            {/* LENS CONTROLS (5 cols) */}
            <div className="col-span-12 md:col-span-5 border border-slate-800 bg-[#0f172a]/50 p-4 rounded-sm flex flex-col relative">
              <div className="absolute top-0 left-0 px-2 py-0.5 bg-slate-800 text-[10px] text-slate-400">LENS_CTRL</div>
              
              <div className="flex-1 flex gap-6 mt-4 justify-center py-4">
                {/* ZOOM SLIDER */}
                <div className="flex flex-col items-center gap-3">
                  <div className="text-[10px] text-slate-400 font-bold tracking-widest">ZOOM</div>
                  <Button variant="outline" size="icon" className="h-8 w-8 rounded-none border-slate-700 bg-slate-800/50 hover:bg-slate-700 hover:text-amber-400"><Maximize className="h-3 w-3" /></Button>
                  <div className="h-40 w-8 bg-slate-900 border border-slate-800 relative py-2 flex justify-center rounded-sm">
                    {/* Tick marks */}
                    <div className="absolute left-0 top-0 bottom-0 w-1 flex flex-col justify-between py-2">
                      {[...Array(9)].map((_, i) => <div key={i} className="w-full h-px bg-slate-700"></div>)}
                    </div>
                    {/* Track & thumb indicator */}
                    <div className="w-1 bg-slate-800 h-full rounded-full relative">
                      <div className="absolute bottom-0 w-full bg-cyan-500 rounded-full" style={{ height: '40%' }}></div>
                    </div>
                  </div>
                  <Button variant="outline" size="icon" className="h-8 w-8 rounded-none border-slate-700 bg-slate-800/50 hover:bg-slate-700 hover:text-amber-400"><ZoomOutIcon /></Button>
                  <div className="text-xs text-cyan-400 mt-1 bg-cyan-950/30 px-2 py-0.5 border border-cyan-900/50">40x</div>
                </div>

                {/* FOCUS SLIDER */}
                <div className="flex flex-col items-center gap-3">
                  <div className="text-[10px] text-slate-400 font-bold tracking-widest">FOCUS</div>
                  <Button variant="outline" size="icon" className="h-8 w-8 rounded-none border-slate-700 bg-slate-800/50 hover:bg-slate-700 hover:text-amber-400"><Focus className="h-3 w-3" /></Button>
                  <div className="h-40 w-8 bg-slate-900 border border-slate-800 relative py-2 flex justify-center rounded-sm">
                     {/* Tick marks */}
                     <div className="absolute left-0 top-0 bottom-0 w-1 flex flex-col justify-between py-2">
                      {[...Array(9)].map((_, i) => <div key={i} className="w-full h-px bg-slate-700"></div>)}
                    </div>
                    <div className="w-1 bg-slate-800 h-full rounded-full relative">
                      <div className="absolute bottom-0 w-full bg-amber-500 rounded-full" style={{ height: '75%' }}></div>
                    </div>
                  </div>
                  <Button variant="outline" size="icon" className="h-8 w-8 rounded-none border-slate-700 bg-slate-800/50 hover:bg-slate-700 hover:text-amber-400"><Aperture className="h-3 w-3" /></Button>
                  <Button variant="outline" className="h-5 text-[9px] px-2 rounded-none border-amber-900/50 bg-amber-950/30 text-amber-500 mt-1">AUTO</Button>
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
                <span>BANK A (1-16)</span>
              </div>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" className="h-6 text-[10px] rounded-none border-slate-700 bg-slate-800 text-slate-300">STORE</Button>
                <Button variant="outline" size="sm" className="h-6 text-[10px] rounded-none border-slate-700 bg-slate-800 text-slate-300">RECALL</Button>
              </div>
            </div>
            
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
              {PRESETS.map(p => (
                <button 
                  key={p.id}
                  className={`
                    relative h-12 flex flex-col items-center justify-center border rounded-sm transition-all
                    ${p.status === 'active' ? 'border-amber-500 bg-amber-950/20 text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.2)]' : 
                      p.status === 'saved' ? 'border-slate-600 bg-slate-800/40 text-slate-300 hover:border-slate-400' : 
                      'border-slate-800 bg-[#020617]/50 text-slate-600 hover:border-slate-700'}
                  `}
                >
                  <span className="text-sm font-bold">{p.id.toString().padStart(2, '0')}</span>
                  {p.status !== 'empty' && (
                    <div className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${p.status === 'active' ? 'bg-amber-500 animate-pulse' : 'bg-cyan-500'}`}></div>
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
              <Button variant="outline" className="h-12 w-20 rounded-sm border-slate-600 bg-slate-800 font-bold text-slate-300">CUT</Button>
              <Button variant="outline" className="h-12 w-24 rounded-sm border-amber-600/50 bg-amber-950/30 font-bold text-amber-500">AUTO</Button>
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

export default CommandCenter;
