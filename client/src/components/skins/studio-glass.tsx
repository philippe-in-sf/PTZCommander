import React, { useState } from "react";
import { 
  Settings2, 
  Maximize,
  Focus,
  MonitorPlay,
  SlidersHorizontal
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "wouter";
import type { DashboardSkinProps } from "./types";
import { Joystick } from "@/components/ptz/joystick";
import { CameraPreview } from "@/components/ptz/camera-preview";
import { BrandWatermark } from "@/components/branding/brand";
import { AppHeader } from "@/components/app-header";
import { useAtemControl } from "@/hooks/use-atem-control";
import { cn } from "@/lib/utils";
import { useSkinMixerData, useSkinSceneButtons } from "./live-data";
import { CONTROL_SURFACE_SCENE_SHORTCUTS } from "@shared/control-surface-shortcuts";

const GlassPanel = ({ children, className = "" }: { children: React.ReactNode, className?: string }) => (
  <div className={`bg-white/70 dark:bg-slate-800/60 backdrop-blur-xl border border-white/50 dark:border-slate-700/50 shadow-xl rounded-3xl ${className}`}>
    {children}
  </div>
);

export default function StudioGlass(props: DashboardSkinProps) {
  const [zoomValue, setZoomValue] = useState([50]);
  const [isStoreMode, setIsStoreMode] = useState(false);
  const { atemState, displayInputs } = useAtemControl();
  const { mixerStripData } = useSkinMixerData(props.ws, "studio-glass");
  const { sceneButtons, activeSceneId, executeScene, sceneExecuting } = useSkinSceneButtons(6);
  const routedInputs = displayInputs.slice(0, 4);

  const handleZoomChange = (val: number[]) => {
    setZoomValue(val);
    props.onZoom(val[0]);
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] dark:bg-[#0f172a] text-slate-800 dark:text-slate-200 font-sans flex flex-col">
      <AppHeader activePage="/" />

      <main className="flex-1 min-h-0 p-6 lg:p-10 space-y-8 overflow-y-auto">
        <BrandWatermark className="fixed bottom-6 right-6 opacity-[0.12]" />
        
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Quick Scenes</h2>
            <Link href="/scenes">
              <Button variant="ghost" className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 rounded-full h-8 px-4 text-xs font-semibold">
                Edit Scenes
              </Button>
            </Link>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-2 -mx-2 px-2 snap-x">
            {sceneButtons.length === 0 ? (
              <Link
                href="/scenes"
                className="snap-start whitespace-nowrap px-6 py-3.5 rounded-full font-medium transition-all shadow-sm border bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-white/50 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                Configure Scenes
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
                    "snap-start whitespace-nowrap px-6 py-3.5 rounded-full font-medium transition-all shadow-sm border disabled:cursor-not-allowed disabled:opacity-60",
                    isActive
                      ? "bg-slate-800 dark:bg-indigo-600 text-white border-slate-800 dark:border-indigo-600 shadow-slate-900/20"
                      : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-white/50 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white"
                  )}
                  style={{ borderColor: isActive ? scene.color : undefined }}
                >
                  <span>{scene.name}</span>
                  {shortcutLabel && <span className="ml-3 text-[10px] text-slate-400 dark:text-slate-500">{shortcutLabel}</span>}
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4">Camera Select</h2>
          <CameraPreview
            cameras={props.cameras}
            selectedId={props.selectedCameraId}
            onSelect={props.onSelectCamera}
          />
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          <div className="lg:col-span-5 space-y-8">
            <GlassPanel className="p-8">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">PTZ Control</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{props.selectedCamera?.name || "No Camera Selected"}</p>
                </div>
                <Button variant="ghost" size="icon" className="rounded-full w-10 h-10 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white">
                  <Settings2 className="w-5 h-5" />
                </Button>
              </div>

              <div className="flex justify-center mb-10">
                <Joystick 
                  onMove={props.onJoystickMove} 
                  onStop={props.onJoystickStop} 
                  className="bg-slate-100 dark:bg-slate-700 border-4 border-white dark:border-slate-600 shadow-inner rounded-full [&>div>div]:bg-indigo-500"
                />
              </div>

              <div className="space-y-6">
                <div className="space-y-3">
                  <div className="flex justify-between text-sm font-medium text-slate-600 dark:text-slate-400">
                    <span className="flex items-center gap-1.5"><Maximize className="w-4 h-4" /> Zoom</span>
                    <span>{zoomValue}%</span>
                  </div>
                  <Slider 
                    value={zoomValue} 
                    onValueChange={handleZoomChange} 
                    max={100} step={1} 
                    className="[&_[role=slider]]:bg-indigo-600 [&_[role=slider]]:border-indigo-600 [&_[role=slider]]:shadow-lg"
                  />
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm font-medium text-slate-600 dark:text-slate-400">
                    <span className="flex items-center gap-1.5"><Focus className="w-4 h-4" /> Focus</span>
                    <Button variant="ghost" size="sm" onClick={props.onFocusAuto} className="h-6 px-2 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/50">Auto Focus</Button>
                  </div>
                  <div className="rounded-2xl border border-slate-200/70 dark:border-slate-700/70 bg-slate-50/70 dark:bg-slate-800/40 px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
                    Manual focus is not available in this skin. Use Auto Focus here, or switch to Classic for near/far focus nudging.
                  </div>
                </div>
              </div>
            </GlassPanel>
          </div>

          <div className="lg:col-span-7 space-y-8">
            
            <GlassPanel className="p-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Presets</h2>
                <div className="flex items-center gap-3">
                  <Button
                    variant={isStoreMode ? "default" : "outline"}
                    size="sm"
                    onClick={() => setIsStoreMode((current) => !current)}
                    className={isStoreMode ? "bg-rose-600 hover:bg-rose-700 text-white" : ""}
                  >
                    {isStoreMode ? "Store Armed" : "Store"}
                  </Button>
                  <Tabs defaultValue="grid" className="w-[120px]">
                    <TabsList className="grid w-full grid-cols-2 bg-slate-100 dark:bg-slate-700 rounded-full h-9 p-1">
                    <TabsTrigger value="grid" className="rounded-full text-xs data-[state=active]:bg-white dark:data-[state=active]:bg-slate-600 data-[state=active]:shadow-sm">Grid</TabsTrigger>
                    <TabsTrigger value="list" className="rounded-full text-xs data-[state=active]:bg-white dark:data-[state=active]:bg-slate-600 data-[state=active]:shadow-sm">List</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              </div>
              
              <div className="grid grid-cols-4 gap-3">
                {Array.from({ length: 16 }).map((_, i) => {
                  const preset = props.presets.find(p => p.presetNumber === i);
                  return (
                    <div key={i} className="relative group">
                      <button
                        onClick={() => {
                          if (isStoreMode) {
                            props.onStorePreset(i);
                            setIsStoreMode(false);
                          } else {
                            props.onRecallPreset(i);
                          }
                        }}
                        className={`h-16 w-full rounded-2xl border transition-all flex flex-col items-center justify-center gap-1 relative ${
                          isStoreMode
                            ? "bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800/50 hover:bg-rose-100 dark:hover:bg-rose-900/30 text-rose-600 dark:text-rose-300"
                            : "bg-slate-50 dark:bg-slate-700/50 border-slate-100 dark:border-slate-600 hover:bg-white dark:hover:bg-slate-600 hover:shadow-md hover:border-indigo-100 dark:hover:border-indigo-500/30 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400"
                        }`}
                        title={isStoreMode ? "Click to store this preset" : "Click to recall this preset"}
                      >
                        <span className="text-xs font-bold text-slate-400 dark:text-slate-500 group-hover:text-indigo-300 transition-colors">{(i + 1).toString().padStart(2, '0')}</span>
                        <span className="max-w-full px-2 text-sm font-medium truncate">{preset?.name || `Preset ${i + 1}`}</span>
                      </button>
                      {preset && !isStoreMode && (
                        <button
                          type="button"
                          onClick={() => props.onManagePreset(preset)}
                          className="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-white/70 bg-white/85 text-slate-500 opacity-0 shadow-sm transition-opacity hover:text-indigo-600 dark:border-slate-600 dark:bg-slate-900/85 dark:text-slate-400 dark:hover:text-indigo-300 group-hover:opacity-100 focus:opacity-100"
                          aria-label={`Manage preset ${i + 1}`}
                          data-testid={`button-manage-preset-${i}`}
                        >
                          <Settings2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </GlassPanel>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <GlassPanel className="p-6 flex flex-col">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-8 h-8 rounded-full bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                    <MonitorPlay className="w-4 h-4" />
                  </div>
                  <h3 className="font-bold text-slate-800 dark:text-slate-200">ATEM Switcher</h3>
                </div>
                
                <div className="space-y-3 flex-1">
                  {routedInputs.map(input => (
                    <div key={input.inputId} className="flex items-center justify-between p-3 rounded-xl bg-slate-50/50 dark:bg-slate-700/30 hover:bg-white dark:hover:bg-slate-700/60 transition-colors">
                      <span className="font-medium text-slate-700 dark:text-slate-300 text-sm">{input.longName || input.shortName || `Input ${input.inputId}`}</span>
                      <div className="flex gap-2">
                        <Badge className={`w-10 flex justify-center py-1 ${atemState.programInput === input.inputId ? 'bg-rose-500 hover:bg-rose-600 text-white' : 'bg-slate-200 dark:bg-slate-600 text-slate-400 dark:text-slate-500 hover:bg-slate-300 dark:hover:bg-slate-500'}`}>PGM</Badge>
                        <Badge className={`w-10 flex justify-center py-1 ${atemState.previewInput === input.inputId ? 'bg-emerald-500 hover:bg-emerald-600 text-white' : 'bg-slate-200 dark:bg-slate-600 text-slate-400 dark:text-slate-500 hover:bg-slate-300 dark:hover:bg-slate-500'}`}>PVW</Badge>
                      </div>
                    </div>
                  ))}
                  {routedInputs.length === 0 && (
                    <div className="p-3 rounded-xl bg-slate-50/50 dark:bg-slate-700/30 text-sm text-slate-500 dark:text-slate-400">
                      No ATEM inputs reported.
                    </div>
                  )}
                </div>
                <Link href="/switcher" className="mt-4 block w-full">
                  <Button variant="outline" className="w-full rounded-xl border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">View Full Switcher</Button>
                </Link>
              </GlassPanel>

              <GlassPanel className="p-6 flex flex-col">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                    <SlidersHorizontal className="w-4 h-4" />
                  </div>
                  <h3 className="font-bold text-slate-800 dark:text-slate-200">Audio Levels</h3>
                </div>
                
                <div className="space-y-4 flex-1 mt-2">
                  {mixerStripData.map(channel => (
                    <div key={channel.id} className="flex items-center gap-4 group">
                      <span className="w-12 text-sm font-medium text-slate-600 dark:text-slate-400 truncate">{channel.label}</span>
                      <div className="flex-1 relative h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div 
                          className={`absolute top-0 left-0 h-full rounded-full transition-all duration-300 ${channel.muted ? 'bg-slate-300 dark:bg-slate-600' : channel.level > 85 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                          style={{ width: `${channel.level}%` }}
                        ></div>
                      </div>
                      <button className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${channel.muted ? 'bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400' : 'bg-slate-50 dark:bg-slate-700 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'}`}>
                        M
                      </button>
                    </div>
                  ))}
                </div>
                <Link href="/mixer" className="mt-4 block w-full">
                  <Button variant="outline" className="w-full rounded-xl border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">View Full Mixer</Button>
                </Link>
              </GlassPanel>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}
