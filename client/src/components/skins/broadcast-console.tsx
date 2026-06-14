import React, { useEffect, useState } from "react";
import { Link } from "wouter";
import { 
  Activity,
  MonitorPlay,
  Maximize,
  Power,
  Volume2,
  Plus,
  LayoutGrid,
  Settings
} from "lucide-react";
import type { DashboardSkinProps } from "./types";
import { Joystick } from "@/components/ptz/joystick";
import { CameraPreview } from "@/components/ptz/camera-preview";
import { BrandWatermark } from "@/components/branding/brand";
import { AppHeader } from "@/components/app-header";
import { useAtemControl } from "@/hooks/use-atem-control";
import { cn } from "@/lib/utils";
import { useSkinMixerData, useSkinSceneButtons } from "./live-data";
import { CONTROL_SURFACE_SCENE_SHORTCUTS } from "@shared/control-surface-shortcuts";

export default function BroadcastConsole(props: DashboardSkinProps) {
  const [storeMode, setStoreMode] = useState(false);
  const { atemState, switcher, displayInputs, cut, auto, setProgramInput, setPreviewInput } = useAtemControl();
  const { mixer, mixerStripData } = useSkinMixerData(props.ws, "broadcast-console");
  const { sceneButtons, activeSceneId, executeScene, sceneExecuting } = useSkinSceneButtons(4);
  const [currentTime, setCurrentTime] = useState(() => new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date()));

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentTime(new Intl.DateTimeFormat("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(new Date()));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const routedInputs = displayInputs.slice(0, 8);

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
      <BrandWatermark className="bottom-4 right-4 opacity-[0.12]" />

      <AppHeader
        activePage="/"
        rightContent={<span className="tabular-nums text-zinc-300">{currentTime}</span>}
      />

      <main className="flex-1 min-h-0 p-3 grid grid-cols-12 gap-3">
        
        <div className="col-span-3 flex flex-col gap-3">
          <div className="bg-[#14141c] border border-[#2a2a3a] rounded-lg flex flex-col flex-1">
            <div className="bg-[#1c1c28] px-3 py-2 border-b border-[#2a2a3a] flex justify-between items-center rounded-t-lg">
              <span className="text-[10px] text-zinc-400 font-semibold">PROGRAM / PREVIEW</span>
              <MonitorPlay size={12} className="text-zinc-500" />
            </div>
            <div className="p-3 flex-1 flex flex-col justify-between">
              <div>
                <div className="text-[10px] text-red-400 mb-1.5 font-semibold">
                  PROGRAM {switcher ? `· ${switcher.name}` : "· NO SWITCHER"}
                </div>
                <div className="grid grid-cols-4 gap-1.5 mb-5">
                  {routedInputs.map(input => (
                    <button key={`pgm-${input.inputId}`} onClick={() => atemState.connected && setProgramInput(input.inputId)} disabled={!atemState.connected}
                      className={cn(
                        "h-12 border rounded flex items-center justify-center text-sm font-bold transition-all disabled:cursor-not-allowed disabled:opacity-45",
                        atemState.programInput === input.inputId
                          ? "bg-red-900/80 border-red-500 text-white shadow-[inset_0_0_12px_rgba(239,68,68,0.3),0_0_8px_rgba(239,68,68,0.2)]"
                          : "bg-[#1a1a24] border-[#363645] hover:border-[#4a4a5a] hover:bg-[#222230] text-zinc-400"
                      )}>
                      {input.shortName || input.inputId}
                    </button>
                  ))}
                </div>
                <div className="text-[10px] text-green-400 mb-1.5 font-semibold">PREVIEW (NEXT)</div>
                <div className="grid grid-cols-4 gap-1.5">
                  {routedInputs.map(input => (
                    <button key={`pvw-${input.inputId}`} onClick={() => atemState.connected && setPreviewInput(input.inputId)} disabled={!atemState.connected}
                      className={cn(
                        "h-12 border rounded flex items-center justify-center text-sm font-bold transition-all disabled:cursor-not-allowed disabled:opacity-45",
                        atemState.previewInput === input.inputId
                          ? "bg-green-900/80 border-green-500 text-white shadow-[inset_0_0_12px_rgba(34,197,94,0.3),0_0_8px_rgba(34,197,94,0.2)]"
                          : "bg-[#1a1a24] border-[#363645] hover:border-[#4a4a5a] hover:bg-[#222230] text-zinc-400"
                      )}>
                      {input.shortName || input.inputId}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="mt-4 flex gap-2">
                <button onClick={cut} disabled={!atemState.connected} className="flex-1 h-10 bg-[#252535] border border-[#454555] hover:bg-[#303045] text-zinc-200 text-xs rounded font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-45">CUT</button>
                <button onClick={auto} disabled={!atemState.connected} className="flex-1 h-10 bg-red-900/60 border border-red-700 hover:bg-red-800/80 text-red-100 text-xs rounded font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-45">AUTO</button>
              </div>
            </div>
          </div>

          <div className="bg-[#14141c] border border-[#2a2a3a] rounded-lg h-48 flex flex-col">
            <div className="bg-[#1c1c28] px-3 py-2 border-b border-[#2a2a3a] flex justify-between items-center rounded-t-lg">
              <span className="text-[10px] text-zinc-400 font-semibold">AUDIO MIX</span>
              <Volume2 size={12} className="text-zinc-500" />
            </div>
            <div className="p-3 flex flex-1 gap-2">
              {mixerStripData.map((ch) => (
                <div key={ch.id} className="flex-1 flex flex-col items-center">
                  <div className="text-[9px] text-zinc-400 mb-2 font-semibold truncate w-full text-center">{ch.label}</div>
                  <div className="flex-1 w-8 bg-[#0e0e14] border border-[#2a2a3a] relative rounded-md flex justify-center py-2">
                    <div className="absolute bottom-0 w-full bg-gradient-to-t from-green-500 via-yellow-500 to-red-500 opacity-20 rounded-b-md" style={{ height: `${ch.muted ? 0 : ch.level}%` }}></div>
                    <div className="w-6 h-4 bg-[#404055] border-y-2 border-zinc-300 absolute rounded-sm shadow-md transition-colors" style={{ bottom: `${Math.max(0, Math.min(90, ch.level))}%` }}></div>
                    <div className="w-0.5 h-full bg-[#0a0a0f]"></div>
                  </div>
                  <div className={`mt-2 w-8 h-4 rounded-sm text-[8px] font-bold flex items-center justify-center ${ch.muted ? 'bg-red-800 text-red-100' : 'bg-[#252535] text-zinc-400'} transition-colors`}>
                    {ch.muted ? "MUT" : "ON"}
                  </div>
                </div>
              ))}
            </div>
            <div className="px-3 pb-2 text-[9px] text-zinc-500 flex justify-between">
              <span className="truncate">{mixer ? mixer.name : "No mixer configured"}</span>
              <span>{mixer?.status === "online" ? "LIVE" : mixer ? mixer.status.toUpperCase() : "OFFLINE"}</span>
            </div>
          </div>
        </div>

        <div className="col-span-6 flex flex-col gap-3">
          <CameraPreview
            cameras={props.cameras}
            selectedId={props.selectedCameraId}
            onSelect={props.onSelectCamera}
          />

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
                  className="w-12 h-10 bg-[#1e1e2a] border border-[#363645] rounded hover:bg-[#2a2a3a] text-[9px] text-cyan-400 font-bold transition-colors"
                >
                  AUTO
                </button>
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
                  <div key={presetSlot} className="relative group min-h-0">
                    <button
                      onClick={() => handlePresetClick(presetSlot)}
                      className={`aspect-square w-full relative rounded-md border flex items-center justify-center text-[10px] font-bold transition-all text-center px-1 overflow-hidden
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
                    {preset && !storeMode && (
                      <button
                        type="button"
                        onClick={() => props.onManagePreset(preset)}
                        className="absolute right-1 top-1 z-10 flex h-5 w-5 items-center justify-center rounded border border-[#363645] bg-[#0c0c10]/85 text-zinc-400 opacity-0 transition-opacity hover:border-cyan-500 hover:text-cyan-200 group-hover:opacity-100 focus:opacity-100"
                        aria-label={`Manage preset ${presetSlot + 1}`}
                        data-testid={`button-manage-preset-${presetSlot}`}
                      >
                        <Settings className="h-3 w-3" />
                      </button>
                    )}
                  </div>
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
              {sceneButtons.length === 0 ? (
                <Link href="/scenes" className="col-span-full bg-[#1a1a24] border border-[#363645] rounded hover:border-[#505060] hover:bg-[#222230] text-[10px] text-zinc-400 flex items-center justify-center px-3 py-2 relative overflow-hidden transition-colors font-semibold">
                  CONFIGURE SCENES
                </Link>
              ) : sceneButtons.map((scene) => {
                const isActive = activeSceneId === scene.id;
                const shortcutLabel = CONTROL_SURFACE_SCENE_SHORTCUTS.find((shortcut) => shortcut.buttonNumber === scene.buttonNumber)?.label;
                return (
                  <button
                    key={scene.id}
                    onClick={() => executeScene(scene.id)}
                    disabled={sceneExecuting}
                    className={cn(
                      "bg-[#1a1a24] border border-[#363645] rounded hover:border-[#505060] hover:bg-[#222230] text-[10px] text-zinc-300 flex items-center justify-start px-3 py-2 relative overflow-hidden transition-colors font-semibold disabled:cursor-not-allowed disabled:opacity-60",
                      isActive && "border-amber-400 text-amber-100"
                    )}
                  >
                    <div className="w-1.5 h-1.5 rounded-full mr-2" style={{ backgroundColor: scene.color }}></div>
                    <span className="truncate">{scene.name}</span>
                    {shortcutLabel && <span className="ml-auto text-[8px] text-zinc-500">{shortcutLabel}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}
