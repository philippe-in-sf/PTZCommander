import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { 
  Camera, Settings, Video, Mic, Lightbulb, Activity, MonitorPlay, 
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Maximize, 
  Focus, Power, Volume2, Plus, GripHorizontal, LayoutGrid, CircleDot
} from "lucide-react";
import type { DashboardSkinProps } from "./types";
import { Joystick } from "@/components/ptz/joystick";
import { SkinSelector } from "@/components/skin-selector";
import { ThemeToggle } from "@/components/theme-toggle";

export default function BroadcastConsole(props: DashboardSkinProps) {
  const [location] = useLocation();
  const [pgmInput, setPgmInput] = useState(1);
  const [pvwInput, setPvwInput] = useState(2);
  const [storeMode, setStoreMode] = useState(false);

  const tabs = [
    { name: "Dashboard", path: "/" },
    { name: "Scenes", path: "/scenes" },
    { name: "Macros", path: "/macros" },
    { name: "Switcher", path: "/switcher" },
    { name: "Audio", path: "/mixer" },
    { name: "Lighting", path: "/lighting" },
  ];

  const handlePresetClick = (presetNumber: number) => {
    if (storeMode) {
      props.onStorePreset(presetNumber);
      setStoreMode(false);
    } else {
      props.onRecallPreset(presetNumber);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-300 font-mono flex flex-col relative overflow-hidden text-xs uppercase tracking-wider"
         style={{
           backgroundImage: `linear-gradient(rgba(20, 20, 20, 0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(20, 20, 20, 0.8) 1px, transparent 1px)`,
           backgroundSize: '20px 20px'
         }}>
      
      {/* Header Panel */}
      <header className="h-12 bg-[#121212] border-b border-[#222] flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 rounded-full bg-red-600 animate-pulse shadow-[0_0_8px_rgba(220,38,38,0.8)]"></div>
            <span className="text-red-500 font-bold tracking-widest text-sm">PTZCOMMAND</span>
          </div>
          <nav className="flex space-x-1">
            {tabs.map((tab, i) => {
              const isActive = location === tab.path || (location === "/dashboard" && tab.path === "/");
              return (
                <Link key={tab.name} href={tab.path} className={`px-4 py-1.5 ${isActive ? 'bg-[#222] text-cyan-400 border-t-2 border-cyan-500' : 'text-zinc-500 hover:text-zinc-300'} transition-colors block`}>
                  {tab.name}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center space-x-4 text-[10px] text-zinc-500">
          <div className="flex items-center space-x-1"><div className="w-1.5 h-1.5 rounded-full bg-green-500"></div><span>ATEM: OK</span></div>
          <div className="flex items-center space-x-1"><div className="w-1.5 h-1.5 rounded-full bg-green-500"></div><span>X32: OK</span></div>
          <div className="flex items-center space-x-1"><div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div><span>HUE: WARN</span></div>
          <span className="ml-4 tabular-nums">14:02:45:12</span>
          <ThemeToggle />
          <SkinSelector />
        </div>
      </header>

      {/* Main Layout */}
      <main className="flex-1 p-3 grid grid-cols-12 gap-3 h-[calc(100vh-48px)]">
        
        {/* Left Column: Switcher & Audio (3 cols) */}
        <div className="col-span-3 flex flex-col gap-3">
          {/* Switcher Panel */}
          <div className="bg-[#111] border border-[#222] rounded flex flex-col flex-1">
            <div className="bg-[#1a1a1a] px-3 py-1.5 border-b border-[#222] flex justify-between items-center">
              <span className="text-[10px] text-zinc-500">PROGRAM / PREVIEW</span>
              <MonitorPlay size={12} className="text-zinc-600" />
            </div>
            <div className="p-3 flex-1 flex flex-col justify-between">
              <div>
                <div className="text-[10px] text-red-500 mb-1">PROGRAM (LIVE)</div>
                <div className="grid grid-cols-4 gap-1 mb-4">
                  {[1, 2, 3, 4].map(i => (
                    <button key={`pgm-${i}`} onClick={() => setPgmInput(i)}
                      className={`h-12 border ${pgmInput === i ? 'bg-red-900 border-red-500 text-red-100 shadow-[inset_0_0_10px_rgba(220,38,38,0.3)]' : 'bg-[#151515] border-[#333] hover:border-[#444] text-zinc-500'} flex items-center justify-center text-lg font-bold transition-all`}>
                      {i}
                    </button>
                  ))}
                </div>
                <div className="text-[10px] text-green-500 mb-1">PREVIEW (NEXT)</div>
                <div className="grid grid-cols-4 gap-1">
                  {[1, 2, 3, 4].map(i => (
                    <button key={`pvw-${i}`} onClick={() => setPvwInput(i)}
                      className={`h-12 border ${pvwInput === i ? 'bg-green-900 border-green-500 text-green-100 shadow-[inset_0_0_10px_rgba(34,197,94,0.3)]' : 'bg-[#151515] border-[#333] hover:border-[#444] text-zinc-500'} flex items-center justify-center text-lg font-bold transition-all`}>
                      {i}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="mt-4 flex gap-2">
                <button className="flex-1 h-10 bg-[#222] border border-[#444] hover:bg-[#333] text-zinc-300 text-xs">CUT</button>
                <button className="flex-1 h-10 bg-red-900/50 border border-red-800 hover:bg-red-800 text-red-200 text-xs">AUTO</button>
              </div>
            </div>
          </div>

          {/* Audio Panel */}
          <div className="bg-[#111] border border-[#222] rounded h-48 flex flex-col">
            <div className="bg-[#1a1a1a] px-3 py-1.5 border-b border-[#222] flex justify-between items-center">
              <span className="text-[10px] text-zinc-500">AUDIO MIX</span>
              <Volume2 size={12} className="text-zinc-600" />
            </div>
            <div className="p-3 flex flex-1 gap-2">
              {['MSTR', 'CAM1', 'CAM2', 'AUX'].map((ch, i) => (
                <div key={ch} className="flex-1 flex flex-col items-center">
                  <div className="text-[9px] text-zinc-500 mb-2">{ch}</div>
                  <div className="flex-1 w-8 bg-[#0a0a0a] border border-[#222] relative rounded flex justify-center py-2">
                    <div className="absolute bottom-0 w-full h-[80%] bg-gradient-to-t from-green-500 via-yellow-500 to-red-500 opacity-20"></div>
                    {/* Fader cap */}
                    <div className={`w-6 h-4 bg-[#333] border-y-2 border-zinc-400 absolute rounded-sm shadow-md cursor-pointer`} style={{ bottom: `${40 + (i * 10)}%` }}></div>
                    {/* Track */}
                    <div className="w-0.5 h-full bg-[#050505]"></div>
                  </div>
                  <button className={`mt-2 w-8 h-4 rounded-sm text-[8px] ${i === 2 ? 'bg-red-900 text-red-200' : 'bg-[#222] text-zinc-500'}`}>ON</button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Center Column: Cameras & Control (6 cols) */}
        <div className="col-span-6 flex flex-col gap-3">
          {/* Camera Strip */}
          <div className="grid grid-cols-4 gap-2 shrink-0">
            {props.cameras.slice(0, 4).map((cam) => (
              <div 
                key={cam.id} 
                onClick={() => props.onSelectCamera(cam.id)}
                className={`h-24 relative rounded border-2 overflow-hidden cursor-pointer transition-all ${props.selectedCameraId === cam.id ? 'border-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.3)]' : 'border-[#333] opacity-70 hover:opacity-100'}`}
              >
                {/* Simulated video feed background */}
                <div className="absolute inset-0 bg-[#151515] flex flex-col p-2">
                  <div className="flex justify-between items-start z-10">
                    <span className="bg-black/80 px-1 py-0.5 text-[10px] truncate max-w-[80%]">{cam.name}</span>
                    <span className={`w-3 h-3 rounded-full shrink-0 ${cam.tallyState === 'program' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,1)]' : cam.tallyState === 'preview' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,1)]' : 'bg-[#333]'}`}></span>
                  </div>
                  
                  {props.selectedCameraId === cam.id && (
                    <div className="absolute inset-0 flex items-center justify-center opacity-30 pointer-events-none">
                      <div className="w-16 h-16 border border-cyan-500 rounded-full flex items-center justify-center">
                        <div className="w-1 h-2 bg-cyan-500 absolute top-0"></div>
                        <div className="w-1 h-2 bg-cyan-500 absolute bottom-0"></div>
                        <div className="w-2 h-1 bg-cyan-500 absolute left-0"></div>
                        <div className="w-2 h-1 bg-cyan-500 absolute right-0"></div>
                        <div className="w-1 h-1 bg-cyan-500"></div>
                      </div>
                    </div>
                  )}
                  
                  <div className="mt-auto z-10 flex justify-between">
                    <span className="text-[9px] text-zinc-500">CAM {cam.id}</span>
                    <span className={`text-[9px] ${cam.status === 'online' ? 'text-green-500' : 'text-red-500'}`}>{cam.status}</span>
                  </div>
                </div>
              </div>
            ))}
            
            {/* Fill empty slots if less than 4 cameras */}
            {Array.from({ length: Math.max(0, 4 - props.cameras.length) }).map((_, i) => (
               <div key={`empty-${i}`} className="h-24 relative rounded border-2 border-[#222] bg-[#0a0a0a] opacity-30"></div>
            ))}
          </div>

          {/* Main Control Area */}
          <div className="bg-[#111] border border-[#222] rounded flex-1 flex p-4 relative overflow-hidden">
            
            {/* Left Lens Controls */}
            <div className="w-16 flex flex-col justify-center gap-6 z-10">
              <div className="flex flex-col items-center gap-2">
                <span className="text-[9px] text-zinc-500">ZOOM</span>
                <button 
                  onMouseDown={() => props.onZoom(1)}
                  onMouseUp={() => props.onZoom(0)}
                  onMouseLeave={() => props.onZoom(0)}
                  className="w-12 h-10 bg-[#1a1a1a] border border-[#333] rounded hover:bg-[#222] flex items-center justify-center active:bg-[#333]">
                  <Plus size={14} />
                </button>
                <div className="h-32 w-6 bg-[#0a0a0a] rounded-full border border-[#222] relative p-1">
                  <div className="w-full h-8 bg-zinc-700 rounded-full absolute top-[50%] -translate-y-1/2 cursor-ns-resize hover:bg-zinc-500 transition-colors"></div>
                </div>
                <button 
                  onMouseDown={() => props.onZoom(-1)}
                  onMouseUp={() => props.onZoom(0)}
                  onMouseLeave={() => props.onZoom(0)}
                  className="w-12 h-10 bg-[#1a1a1a] border border-[#333] rounded hover:bg-[#222] flex items-center justify-center active:bg-[#333]">
                  <div className="w-3 h-0.5 bg-current"></div>
                </button>
              </div>
            </div>

            {/* Center Joystick Area */}
            <div className="flex-1 flex flex-col items-center justify-center relative">
              <div className="absolute top-0 flex items-center justify-center gap-2 px-4 py-1.5 bg-[#1a1a1a] border border-[#333] rounded-full z-10">
                <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse"></span>
                <span className="text-cyan-400 font-bold">{props.selectedCamera?.name || "NO CAMERA"}</span>
              </div>

              {/* D-Pad / Joystick Visual */}
              <div className="relative mt-4 flex items-center justify-center w-full h-full max-h-[300px]">
                <Joystick 
                  onMove={props.onJoystickMove} 
                  onStop={props.onJoystickStop} 
                  className="!w-64 !h-64 !bg-transparent !border-4 !border-[#1a1a1a] !shadow-[inset_0_0_20px_rgba(0,0,0,1)]"
                />
              </div>

              <div className="absolute bottom-4 flex gap-4">
                <button className="px-4 py-2 bg-[#1a1a1a] border border-[#333] rounded hover:border-cyan-500 text-xs flex items-center gap-2 transition-colors"><Maximize size={12}/> RECENTER</button>
                <button className="px-4 py-2 bg-[#1a1a1a] border border-[#333] rounded hover:border-cyan-500 text-xs flex items-center gap-2 transition-colors"><Power size={12}/> STANDBY</button>
              </div>
            </div>

            {/* Right Lens Controls */}
            <div className="w-16 flex flex-col justify-center gap-6 z-10">
              <div className="flex flex-col items-center gap-2">
                <span className="text-[9px] text-zinc-500">FOCUS</span>
                <button 
                  onClick={props.onFocusAuto}
                  className="w-12 h-8 bg-[#1a1a1a] border border-[#333] rounded hover:bg-[#222] text-[9px] text-cyan-500 transition-colors">AUTO</button>
                <button className="w-12 h-10 bg-[#1a1a1a] border border-[#333] rounded hover:bg-[#222] flex items-center justify-center"><Plus size={14} /></button>
                <div className="h-32 w-6 bg-[#0a0a0a] rounded-full border border-[#222] relative p-1">
                  <div className="w-full h-8 bg-zinc-700 rounded-full absolute top-[50%] -translate-y-1/2 cursor-ns-resize hover:bg-zinc-500 transition-colors"></div>
                </div>
                <button className="w-12 h-10 bg-[#1a1a1a] border border-[#333] rounded hover:bg-[#222] flex items-center justify-center"><div className="w-3 h-0.5 bg-current"></div></button>
              </div>
            </div>

          </div>
        </div>

        {/* Right Column: Presets & Macros (3 cols) */}
        <div className="col-span-3 flex flex-col gap-3">
          {/* Preset Grid */}
          <div className="bg-[#111] border border-[#222] rounded flex-1 flex flex-col">
            <div className="bg-[#1a1a1a] px-3 py-1.5 border-b border-[#222] flex justify-between items-center">
              <span className="text-[10px] text-zinc-500">PRESETS {props.selectedCamera ? `(CAM ${props.selectedCamera.id})` : ''}</span>
              <LayoutGrid size={12} className="text-zinc-600" />
            </div>
            <div className="p-3 grid grid-cols-4 gap-2 flex-1 content-start">
              {Array.from({ length: 16 }).map((_, i) => {
                const presetSlot = i; // 0-15
                const preset = props.presets.find(p => p.presetNumber === presetSlot);
                
                return (
                  <button 
                    key={presetSlot}
                    onClick={() => handlePresetClick(presetSlot)}
                    className={`aspect-square relative rounded border flex items-center justify-center text-[10px] font-bold transition-all text-center px-1 overflow-hidden
                      ${storeMode
                        ? 'bg-amber-900/50 border-amber-500 text-amber-100 animate-pulse'
                        : preset 
                          ? 'bg-cyan-900/50 border-cyan-700 text-cyan-100 hover:border-cyan-400' 
                          : 'bg-[#151515] border-[#333] text-zinc-600 hover:border-[#555] hover:text-zinc-400 shadow-[inset_0_2px_5px_rgba(0,0,0,0.5)]'
                      }
                    `}
                  >
                    <span className="absolute top-1 left-1 text-[8px] opacity-50 font-normal">P{presetSlot + 1}</span>
                    <span className="mt-2 w-full truncate">{preset?.name || ''}</span>
                  </button>
                )
              })}
            </div>
            <div className="p-3 border-t border-[#222] bg-[#151515] flex justify-between">
              <button 
                onClick={() => setStoreMode(!storeMode)}
                className={`px-3 py-1.5 border rounded text-[10px] transition-colors ${storeMode ? 'bg-amber-900 border-amber-500 text-amber-100' : 'bg-[#222] border-[#444] text-zinc-400 hover:text-white'}`}>
                {storeMode ? 'SELECT SLOT' : 'STORE'}
              </button>
              <button className="px-3 py-1.5 bg-[#222] border border-[#444] rounded text-[10px] text-zinc-400 hover:text-white">CLEAR</button>
            </div>
          </div>

          {/* Macros Strip */}
          <div className="bg-[#111] border border-[#222] rounded h-32 flex flex-col">
            <div className="bg-[#1a1a1a] px-3 py-1.5 border-b border-[#222] flex justify-between items-center">
              <span className="text-[10px] text-zinc-500">QUICK MACROS</span>
              <Activity size={12} className="text-zinc-600" />
            </div>
            <div className="p-3 grid grid-cols-2 gap-2 flex-1">
              {['WORSHIP', 'SERMON', 'BAPTISM', 'WALKIN'].map((macro) => (
                <button key={macro} className="bg-[#151515] border border-[#333] rounded hover:border-[#555] text-[10px] text-zinc-400 flex items-center justify-start px-3 py-2 relative overflow-hidden transition-colors">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-500/50 mr-2"></div>
                  {macro}
                  <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-[#1a1a1a] to-transparent pointer-events-none"></div>
                </button>
              ))}
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}
