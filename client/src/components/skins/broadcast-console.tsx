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
import { RehearsalToggle } from "@/components/rehearsal-toggle";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export default function BroadcastConsole(props: DashboardSkinProps) {
  const [location] = useLocation();
  const [pgmInput, setPgmInput] = useState(1);
  const [pvwInput, setPvwInput] = useState(2);
  const [storeMode, setStoreMode] = useState(false);

  const tabs = [
    { name: "Dashboard", path: "/" },
    { name: "Scenes", path: "/scenes" },
    { name: "Run", path: "/runsheet" },
  ];
  const tabGroups = [
    {
      name: "Prod",
      paths: ["/switcher", "/mixer", "/lighting", "/displays"],
      items: [
        { name: "Switcher", path: "/switcher" },
        { name: "Audio", path: "/mixer" },
        { name: "Lighting", path: "/lighting" },
        { name: "Displays", path: "/displays" },
      ],
    },
    {
      name: "Tools",
      paths: ["/macros", "/diagnostics"],
      items: [
        { name: "Macros", path: "/macros" },
        { name: "Diagnostics", path: "/diagnostics" },
      ],
    },
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
    <div className="min-h-screen bg-[#0c0c10] text-zinc-200 font-mono flex flex-col relative overflow-hidden text-xs uppercase tracking-wider"
         style={{
           backgroundImage: `linear-gradient(rgba(30, 30, 40, 0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(30, 30, 40, 0.5) 1px, transparent 1px)`,
           backgroundSize: '20px 20px'
         }}>
      
      <header className="h-12 bg-[#16161e] border-b border-[#2a2a3a] flex items-center justify-between px-4 shrink-0 z-50 relative shadow-lg">
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]"></div>
            <span className="text-red-400 font-bold tracking-widest text-sm">PTZCOMMAND</span>
          </div>
          <nav className="flex space-x-1">
            {tabs.map((tab) => {
              const isActive = location === tab.path || (location === "/dashboard" && tab.path === "/");
              return (
                <Link key={tab.name} href={tab.path} className={`px-3 py-1.5 ${isActive ? 'bg-[#252535] text-cyan-400 border-t-2 border-cyan-400' : 'text-zinc-400 hover:text-zinc-100 hover:bg-[#1e1e2a]'} transition-colors block`}>
                  {tab.name}
                </Link>
              );
            })}
            {tabGroups.map((group) => {
              const isActive = group.paths.includes(location);
              return (
                <DropdownMenu key={group.name}>
                  <DropdownMenuTrigger asChild>
                    <button className={`px-3 py-1.5 ${isActive ? 'bg-[#252535] text-cyan-400 border-t-2 border-cyan-400' : 'text-zinc-400 hover:text-zinc-100 hover:bg-[#1e1e2a]'} transition-colors inline-flex items-center`}>
                      {group.name}
                      <ChevronDown className="w-3 h-3 ml-1" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {group.items.map((item) => (
                      <DropdownMenuItem key={item.path} asChild>
                        <Link href={item.path} className="cursor-pointer">{item.name}</Link>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center space-x-4 text-[10px] text-zinc-400">
          <RehearsalToggle />
          <div className="flex items-center space-x-1"><div className="w-1.5 h-1.5 rounded-full bg-green-400"></div><span>ATEM: OK</span></div>
          <div className="flex items-center space-x-1"><div className="w-1.5 h-1.5 rounded-full bg-green-400"></div><span>X32: OK</span></div>
          <div className="flex items-center space-x-1"><div className="w-1.5 h-1.5 rounded-full bg-amber-400"></div><span>HUE: WARN</span></div>
          <span className="ml-4 tabular-nums text-zinc-300">14:02:45:12</span>
          <ThemeToggle />
          <SkinSelector />
        </div>
      </header>

      <main className="flex-1 p-3 grid grid-cols-12 gap-3 h-[calc(100vh-48px)]">
        
        <div className="col-span-3 flex flex-col gap-3">
          <div className="bg-[#14141c] border border-[#2a2a3a] rounded-lg flex flex-col flex-1">
            <div className="bg-[#1c1c28] px-3 py-2 border-b border-[#2a2a3a] flex justify-between items-center rounded-t-lg">
              <span className="text-[10px] text-zinc-400 font-semibold">PROGRAM / PREVIEW</span>
              <MonitorPlay size={12} className="text-zinc-500" />
            </div>
            <div className="p-3 flex-1 flex flex-col justify-between">
              <div>
                <div className="text-[10px] text-red-400 mb-1.5 font-semibold">PROGRAM (LIVE)</div>
                <div className="grid grid-cols-4 gap-1.5 mb-5">
                  {[1, 2, 3, 4].map(i => (
                    <button key={`pgm-${i}`} onClick={() => setPgmInput(i)}
                      className={`h-12 border rounded ${pgmInput === i ? 'bg-red-900/80 border-red-500 text-white shadow-[inset_0_0_12px_rgba(239,68,68,0.3),0_0_8px_rgba(239,68,68,0.2)]' : 'bg-[#1a1a24] border-[#363645] hover:border-[#4a4a5a] hover:bg-[#222230] text-zinc-400'} flex items-center justify-center text-lg font-bold transition-all`}>
                      {i}
                    </button>
                  ))}
                </div>
                <div className="text-[10px] text-green-400 mb-1.5 font-semibold">PREVIEW (NEXT)</div>
                <div className="grid grid-cols-4 gap-1.5">
                  {[1, 2, 3, 4].map(i => (
                    <button key={`pvw-${i}`} onClick={() => setPvwInput(i)}
                      className={`h-12 border rounded ${pvwInput === i ? 'bg-green-900/80 border-green-500 text-white shadow-[inset_0_0_12px_rgba(34,197,94,0.3),0_0_8px_rgba(34,197,94,0.2)]' : 'bg-[#1a1a24] border-[#363645] hover:border-[#4a4a5a] hover:bg-[#222230] text-zinc-400'} flex items-center justify-center text-lg font-bold transition-all`}>
                      {i}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="mt-4 flex gap-2">
                <button className="flex-1 h-10 bg-[#252535] border border-[#454555] hover:bg-[#303045] text-zinc-200 text-xs rounded font-bold transition-colors">CUT</button>
                <button className="flex-1 h-10 bg-red-900/60 border border-red-700 hover:bg-red-800/80 text-red-100 text-xs rounded font-bold transition-colors">AUTO</button>
              </div>
            </div>
          </div>

          <div className="bg-[#14141c] border border-[#2a2a3a] rounded-lg h-48 flex flex-col">
            <div className="bg-[#1c1c28] px-3 py-2 border-b border-[#2a2a3a] flex justify-between items-center rounded-t-lg">
              <span className="text-[10px] text-zinc-400 font-semibold">AUDIO MIX</span>
              <Volume2 size={12} className="text-zinc-500" />
            </div>
            <div className="p-3 flex flex-1 gap-2">
              {['MSTR', 'CAM1', 'CAM2', 'AUX'].map((ch, i) => (
                <div key={ch} className="flex-1 flex flex-col items-center">
                  <div className="text-[9px] text-zinc-400 mb-2 font-semibold">{ch}</div>
                  <div className="flex-1 w-8 bg-[#0e0e14] border border-[#2a2a3a] relative rounded-md flex justify-center py-2">
                    <div className="absolute bottom-0 w-full h-[80%] bg-gradient-to-t from-green-500 via-yellow-500 to-red-500 opacity-15 rounded-b-md"></div>
                    <div className="w-6 h-4 bg-[#404055] border-y-2 border-zinc-300 absolute rounded-sm shadow-md cursor-ns-resize hover:bg-[#505068] transition-colors" style={{ bottom: `${40 + (i * 10)}%` }}></div>
                    <div className="w-0.5 h-full bg-[#0a0a0f]"></div>
                  </div>
                  <button className={`mt-2 w-8 h-4 rounded-sm text-[8px] font-bold ${i === 2 ? 'bg-red-800 text-red-100' : 'bg-[#252535] text-zinc-400 hover:bg-[#303040]'} transition-colors`}>ON</button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="col-span-6 flex flex-col gap-3">
          <div className="grid grid-cols-4 gap-2 shrink-0">
            {props.cameras.slice(0, 4).map((cam) => (
              <div 
                key={cam.id} 
                onClick={() => props.onSelectCamera(cam.id)}
                className={`h-24 relative rounded-lg border-2 overflow-hidden cursor-pointer transition-all ${props.selectedCameraId === cam.id ? 'border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.3)]' : 'border-[#363645] hover:border-[#4a4a5a] opacity-80 hover:opacity-100'}`}
              >
                <div className="absolute inset-0 bg-[#1a1a24] flex flex-col p-2">
                  <div className="flex justify-between items-start z-10">
                    <span className="bg-black/70 px-1.5 py-0.5 text-[10px] truncate max-w-[80%] text-zinc-200 rounded">{cam.name}</span>
                    <span className={`w-3 h-3 rounded-full shrink-0 ${cam.tallyState === 'program' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,1)]' : cam.tallyState === 'preview' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,1)]' : 'bg-[#404055]'}`}></span>
                  </div>
                  
                  {props.selectedCameraId === cam.id && (
                    <div className="absolute inset-0 flex items-center justify-center opacity-30 pointer-events-none">
                      <div className="w-16 h-16 border border-cyan-400 rounded-full flex items-center justify-center">
                        <div className="w-1 h-2 bg-cyan-400 absolute top-0"></div>
                        <div className="w-1 h-2 bg-cyan-400 absolute bottom-0"></div>
                        <div className="w-2 h-1 bg-cyan-400 absolute left-0"></div>
                        <div className="w-2 h-1 bg-cyan-400 absolute right-0"></div>
                        <div className="w-1 h-1 bg-cyan-400"></div>
                      </div>
                    </div>
                  )}
                  
                  <div className="mt-auto z-10 flex justify-between">
                    <span className="text-[9px] text-zinc-400">CAM {cam.id}</span>
                    <span className={`text-[9px] font-semibold ${cam.status === 'online' ? 'text-green-400' : 'text-red-400'}`}>{cam.status}</span>
                  </div>
                </div>
              </div>
            ))}
            
            {Array.from({ length: Math.max(0, 4 - props.cameras.length) }).map((_, i) => (
               <div key={`empty-${i}`} className="h-24 relative rounded-lg border-2 border-[#252535] bg-[#0e0e14] opacity-40"></div>
            ))}
          </div>

          <div className="bg-[#14141c] border border-[#2a2a3a] rounded-lg flex-1 flex p-4 relative overflow-hidden">
            
            <div className="w-16 flex flex-col justify-center gap-6 z-10">
              <div className="flex flex-col items-center gap-2">
                <span className="text-[9px] text-zinc-400 font-semibold">ZOOM</span>
                <button 
                  onMouseDown={() => props.onZoom(1)}
                  onMouseUp={() => props.onZoom(0)}
                  onMouseLeave={() => props.onZoom(0)}
                  className="w-12 h-10 bg-[#1e1e2a] border border-[#363645] rounded hover:bg-[#2a2a3a] hover:border-[#4a4a5a] flex items-center justify-center active:bg-[#363645] transition-colors">
                  <Plus size={14} className="text-zinc-300" />
                </button>
                <div className="h-32 w-6 bg-[#0e0e14] rounded-full border border-[#2a2a3a] relative p-1">
                  <div className="w-full h-8 bg-[#404055] rounded-full absolute top-[50%] -translate-y-1/2 cursor-ns-resize hover:bg-[#505068] transition-colors"></div>
                </div>
                <button 
                  onMouseDown={() => props.onZoom(-1)}
                  onMouseUp={() => props.onZoom(0)}
                  onMouseLeave={() => props.onZoom(0)}
                  className="w-12 h-10 bg-[#1e1e2a] border border-[#363645] rounded hover:bg-[#2a2a3a] hover:border-[#4a4a5a] flex items-center justify-center active:bg-[#363645] transition-colors">
                  <div className="w-3 h-0.5 bg-zinc-300"></div>
                </button>
              </div>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center relative">
              <div className="absolute top-0 flex items-center justify-center gap-2 px-4 py-1.5 bg-[#1c1c28] border border-[#363645] rounded-full z-10">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
                <span className="text-cyan-300 font-bold">{props.selectedCamera?.name || "NO CAMERA"}</span>
              </div>

              <div className="relative mt-4 flex items-center justify-center w-full h-full max-h-[300px]">
                <Joystick 
                  onMove={props.onJoystickMove} 
                  onStop={props.onJoystickStop} 
                  className="!w-64 !h-64 !bg-transparent !border-4 !border-[#252535] !shadow-[inset_0_0_20px_rgba(0,0,0,0.8)]"
                />
              </div>

              <div className="absolute bottom-4 flex gap-4">
                <button className="px-4 py-2 bg-[#1e1e2a] border border-[#363645] rounded hover:border-cyan-500 hover:bg-[#252535] text-zinc-300 text-xs flex items-center gap-2 transition-colors"><Maximize size={12}/> RECENTER</button>
                <button className="px-4 py-2 bg-[#1e1e2a] border border-[#363645] rounded hover:border-cyan-500 hover:bg-[#252535] text-zinc-300 text-xs flex items-center gap-2 transition-colors"><Power size={12}/> STANDBY</button>
              </div>
            </div>

            <div className="w-16 flex flex-col justify-center gap-6 z-10">
              <div className="flex flex-col items-center gap-2">
                <span className="text-[9px] text-zinc-400 font-semibold">FOCUS</span>
                <button 
                  onClick={props.onFocusAuto}
                  className="w-12 h-8 bg-[#1e1e2a] border border-[#363645] rounded hover:bg-[#2a2a3a] text-[9px] text-cyan-400 font-bold transition-colors">AUTO</button>
                <button className="w-12 h-10 bg-[#1e1e2a] border border-[#363645] rounded hover:bg-[#2a2a3a] hover:border-[#4a4a5a] flex items-center justify-center transition-colors"><Plus size={14} className="text-zinc-300" /></button>
                <div className="h-32 w-6 bg-[#0e0e14] rounded-full border border-[#2a2a3a] relative p-1">
                  <div className="w-full h-8 bg-[#404055] rounded-full absolute top-[50%] -translate-y-1/2 cursor-ns-resize hover:bg-[#505068] transition-colors"></div>
                </div>
                <button className="w-12 h-10 bg-[#1e1e2a] border border-[#363645] rounded hover:bg-[#2a2a3a] hover:border-[#4a4a5a] flex items-center justify-center transition-colors"><div className="w-3 h-0.5 bg-zinc-300"></div></button>
              </div>
            </div>

          </div>
        </div>

        <div className="col-span-3 flex flex-col gap-3">
          <div className="bg-[#14141c] border border-[#2a2a3a] rounded-lg flex-1 flex flex-col">
            <div className="bg-[#1c1c28] px-3 py-2 border-b border-[#2a2a3a] flex justify-between items-center rounded-t-lg">
              <span className="text-[10px] text-zinc-400 font-semibold">PRESETS {props.selectedCamera ? `(CAM ${props.selectedCamera.id})` : ''}</span>
              <LayoutGrid size={12} className="text-zinc-500" />
            </div>
            <div className="p-3 grid grid-cols-4 gap-2 flex-1 content-start">
              {Array.from({ length: 16 }).map((_, i) => {
                const presetSlot = i;
                const preset = props.presets.find(p => p.presetNumber === presetSlot);
                
                return (
                  <button 
                    key={presetSlot}
                    onClick={() => handlePresetClick(presetSlot)}
                    className={`aspect-square relative rounded-md border flex items-center justify-center text-[10px] font-bold transition-all text-center px-1 overflow-hidden
                      ${storeMode
                        ? 'bg-amber-900/60 border-amber-500 text-amber-100 animate-pulse'
                        : preset 
                          ? 'bg-cyan-900/40 border-cyan-600 text-cyan-200 hover:border-cyan-400 hover:bg-cyan-800/50' 
                          : 'bg-[#1a1a24] border-[#363645] text-zinc-500 hover:border-[#505060] hover:text-zinc-300 hover:bg-[#222230]'
                      }
                    `}
                  >
                    <span className="absolute top-1 left-1 text-[8px] opacity-60 font-normal">P{presetSlot + 1}</span>
                    <span className="mt-2 w-full truncate">{preset?.name || ''}</span>
                  </button>
                )
              })}
            </div>
            <div className="p-3 border-t border-[#2a2a3a] bg-[#1a1a24] flex justify-between rounded-b-lg">
              <button 
                onClick={() => setStoreMode(!storeMode)}
                className={`px-3 py-1.5 border rounded text-[10px] font-bold transition-colors ${storeMode ? 'bg-amber-800 border-amber-500 text-amber-100' : 'bg-[#252535] border-[#454555] text-zinc-300 hover:text-white hover:bg-[#303040]'}`}>
                {storeMode ? 'SELECT SLOT' : 'STORE'}
              </button>
              <button className="px-3 py-1.5 bg-[#252535] border border-[#454555] rounded text-[10px] text-zinc-300 hover:text-white hover:bg-[#303040] font-bold transition-colors">CLEAR</button>
            </div>
          </div>

          <div className="bg-[#14141c] border border-[#2a2a3a] rounded-lg h-32 flex flex-col">
            <div className="bg-[#1c1c28] px-3 py-2 border-b border-[#2a2a3a] flex justify-between items-center rounded-t-lg">
              <span className="text-[10px] text-zinc-400 font-semibold">QUICK MACROS</span>
              <Activity size={12} className="text-zinc-500" />
            </div>
            <div className="p-3 grid grid-cols-2 gap-2 flex-1">
              {['WORSHIP', 'SERMON', 'BAPTISM', 'WALKIN'].map((macro) => (
                <button key={macro} className="bg-[#1a1a24] border border-[#363645] rounded hover:border-[#505060] hover:bg-[#222230] text-[10px] text-zinc-300 flex items-center justify-start px-3 py-2 relative overflow-hidden transition-colors font-semibold">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-400/70 mr-2"></div>
                  {macro}
                </button>
              ))}
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}
