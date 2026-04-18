import React, { useState } from "react";
import { 
  Camera, 
  Video, 
  Mic, 
  Lightbulb, 
  LayoutDashboard, 
  Settings2, 
  Layers,
  ListChecks,
  Power,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Maximize,
  Focus,
  Activity,
  MonitorPlay,
  Play,
  Radio,
  SlidersHorizontal,
  CircleDot
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link, useLocation } from "wouter";
import type { DashboardSkinProps } from "./types";
import { Joystick } from "@/components/ptz/joystick";
import { SkinSelector } from "@/components/skin-selector";
import { ThemeToggle } from "@/components/theme-toggle";

const scenes = ["Pre-Service", "Worship", "Sermon", "Altar Call", "Post-Service", "Emergency"];
const atemInputs = [
  { id: 1, name: "Cam 1", status: "program" },
  { id: 2, name: "Cam 2", status: "preview" },
  { id: 3, name: "Cam 3", status: "none" },
  { id: 4, name: "Cam 4", status: "none" },
  { id: 5, name: "ProPresenter", status: "none" },
  { id: 6, name: "Media", status: "none" },
];

const audioChannels = [
  { id: 1, name: "Vox 1", level: 75, mute: false },
  { id: 2, name: "Vox 2", level: 65, mute: false },
  { id: 3, name: "Keys", level: 80, mute: false },
  { id: 4, name: "Drums", level: 90, mute: true },
  { id: 5, name: "Track", level: 85, mute: false },
];

const GlassPanel = ({ children, className = "" }: { children: React.ReactNode, className?: string }) => (
  <div className={`bg-white/70 dark:bg-slate-800/60 backdrop-blur-xl border border-white/50 dark:border-slate-700/50 shadow-xl rounded-3xl ${className}`}>
    {children}
  </div>
);

export default function StudioGlass(props: DashboardSkinProps) {
  const [zoomValue, setZoomValue] = useState([50]);
  const [focusValue, setFocusValue] = useState([50]);
  const [location] = useLocation();

  const handleZoomChange = (val: number[]) => {
    setZoomValue(val);
    props.onZoom(val[0]);
  };

  const navItems = [
    { icon: LayoutDashboard, label: "Dashboard", href: "/" },
    { icon: Layers, label: "Scenes", href: "/scenes" },
    { icon: Settings2, label: "Macros", href: "/macros" },
    { icon: ListChecks, label: "Runsheet", href: "/runsheet" },
    { icon: Video, label: "Video Switcher", href: "/switcher" },
    { icon: Mic, label: "Audio Mixer", href: "/mixer" },
    { icon: Lightbulb, label: "Lighting", href: "/lighting" },
  ];

  return (
    <div className="min-h-screen bg-[#f8fafc] dark:bg-[#0f172a] text-slate-800 dark:text-slate-200 font-sans flex">
      <aside className="w-64 h-screen fixed left-0 top-0 p-6 flex flex-col gap-8 z-10">
        <div className="flex items-center gap-3 px-2">
          <div className="w-10 h-10 rounded-xl bg-indigo-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/30">
            <Radio className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h1 className="font-bold text-xl tracking-tight text-slate-900 dark:text-white">PTZCOMMAND</h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">System Online</span>
            </div>
          </div>
          <ThemeToggle />
          <SkinSelector />
        </div>

        <nav className="flex-1 space-y-2">
          {navItems.map((item, i) => {
            const active = location === item.href;
            return (
              <Link key={i} href={item.href} className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all duration-200 font-medium ${
                active 
                  ? "bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 shadow-sm" 
                  : "text-slate-500 dark:text-slate-400 hover:bg-slate-100/50 dark:hover:bg-slate-800/50 hover:text-slate-800 dark:hover:text-slate-200"
              }`}>
                <item.icon className={`w-5 h-5 ${active ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400 dark:text-slate-500"}`} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto">
          <GlassPanel className="p-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
              <Activity className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">System Health</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">All services nominal</p>
            </div>
          </GlassPanel>
        </div>
      </aside>

      <main className="flex-1 ml-64 p-6 lg:p-10 space-y-8 h-screen overflow-y-auto">
        
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
            {scenes.map((scene, i) => (
              <button 
                key={i} 
                className={`snap-start whitespace-nowrap px-6 py-3.5 rounded-full font-medium transition-all shadow-sm border ${
                  i === 0 
                    ? "bg-slate-800 dark:bg-indigo-600 text-white border-slate-800 dark:border-indigo-600 hover:bg-slate-900 dark:hover:bg-indigo-700 shadow-slate-900/20" 
                    : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-white/50 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                {scene}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4">Camera Select</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {props.cameras.map((cam) => (
              <button
                key={cam.id}
                onClick={() => props.onSelectCamera(cam.id)}
                className={`group relative text-left rounded-3xl p-1.5 transition-all duration-300 ${
                  props.selectedCameraId === cam.id 
                    ? "bg-indigo-500 shadow-xl shadow-indigo-500/20 scale-[1.02]" 
                    : "bg-white/50 dark:bg-slate-800/50 hover:bg-white/80 dark:hover:bg-slate-700/80 hover:shadow-lg"
                }`}
              >
                <div className={`relative h-32 rounded-2xl overflow-hidden mb-3 ${props.selectedCameraId === cam.id ? "ring-2 ring-white/20" : ""}`}>
                  <div className="absolute inset-0 bg-slate-200 dark:bg-slate-700" style={{ 
                    backgroundImage: cam.streamUrl ? `url(${cam.streamUrl})` : `url(https://images.unsplash.com/photo-1598555353066-681b4fc64fbe?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3)`, 
                    backgroundSize: 'cover', 
                    backgroundPosition: 'center', 
                    opacity: cam.status === 'offline' ? 0.3 : 1 
                  }}></div>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/0"></div>
                  
                  <div className="absolute top-3 left-3 flex gap-2">
                    {cam.tallyState === "program" && (
                      <Badge className="bg-rose-500 hover:bg-rose-600 text-white border-0 shadow-md px-2 py-0.5">PGM</Badge>
                    )}
                    {cam.tallyState === "preview" && (
                      <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white border-0 shadow-md px-2 py-0.5">PVW</Badge>
                    )}
                  </div>
                  {cam.status === "offline" && (
                    <div className="absolute inset-0 flex items-center justify-center backdrop-blur-sm">
                      <Badge variant="secondary" className="bg-slate-900/80 text-white border-0">OFFLINE</Badge>
                    </div>
                  )}
                </div>
                <div className="px-3 pb-3">
                  <h3 className={`font-semibold text-base mb-1 ${props.selectedCameraId === cam.id ? "text-white" : "text-slate-800 dark:text-slate-200"}`}>
                    {cam.name}
                  </h3>
                  <p className={`text-xs flex items-center gap-1.5 ${props.selectedCameraId === cam.id ? "text-indigo-100" : "text-slate-500 dark:text-slate-400"}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${cam.status === 'online' ? 'bg-emerald-400' : 'bg-slate-300 dark:bg-slate-600'}`}></span>
                    {cam.status === 'online' ? 'Connected' : 'Disconnected'}
                  </p>
                </div>
              </button>
            ))}
          </div>
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
                  <Slider 
                    value={focusValue} 
                    onValueChange={setFocusValue} 
                    max={100} step={1}
                    className="[&_[role=slider]]:bg-indigo-600 [&_[role=slider]]:border-indigo-600 [&_[role=slider]]:shadow-lg"
                  />
                </div>
              </div>
            </GlassPanel>
          </div>

          <div className="lg:col-span-7 space-y-8">
            
            <GlassPanel className="p-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Presets</h2>
                <Tabs defaultValue="grid" className="w-[120px]">
                  <TabsList className="grid w-full grid-cols-2 bg-slate-100 dark:bg-slate-700 rounded-full h-9 p-1">
                    <TabsTrigger value="grid" className="rounded-full text-xs data-[state=active]:bg-white dark:data-[state=active]:bg-slate-600 data-[state=active]:shadow-sm">Grid</TabsTrigger>
                    <TabsTrigger value="list" className="rounded-full text-xs data-[state=active]:bg-white dark:data-[state=active]:bg-slate-600 data-[state=active]:shadow-sm">List</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              
              <div className="grid grid-cols-4 gap-3">
                {Array.from({ length: 16 }).map((_, i) => {
                  const preset = props.presets.find(p => p.presetNumber === i);
                  return (
                    <button 
                      key={i}
                      onClick={() => props.onRecallPreset(i)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        props.onStorePreset(i);
                      }}
                      className="h-16 rounded-2xl bg-slate-50 dark:bg-slate-700/50 border border-slate-100 dark:border-slate-600 hover:bg-white dark:hover:bg-slate-600 hover:shadow-md hover:border-indigo-100 dark:hover:border-indigo-500/30 transition-all flex flex-col items-center justify-center gap-1 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 group relative"
                      title="Left-click to recall, Right-click to store"
                    >
                      <span className="text-xs font-bold text-slate-400 dark:text-slate-500 group-hover:text-indigo-300 transition-colors">{(i + 1).toString().padStart(2, '0')}</span>
                      <span className="text-sm font-medium">{preset?.name || `Preset ${i + 1}`}</span>
                    </button>
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
                  {atemInputs.slice(0, 4).map(input => (
                    <div key={input.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50/50 dark:bg-slate-700/30 hover:bg-white dark:hover:bg-slate-700/60 transition-colors">
                      <span className="font-medium text-slate-700 dark:text-slate-300 text-sm">{input.name}</span>
                      <div className="flex gap-2">
                        <Badge className={`w-10 flex justify-center py-1 ${input.status === 'program' ? 'bg-rose-500 hover:bg-rose-600' : 'bg-slate-200 dark:bg-slate-600 text-slate-400 dark:text-slate-500 hover:bg-slate-300 dark:hover:bg-slate-500'}`}>PGM</Badge>
                        <Badge className={`w-10 flex justify-center py-1 ${input.status === 'preview' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-slate-200 dark:bg-slate-600 text-slate-400 dark:text-slate-500 hover:bg-slate-300 dark:hover:bg-slate-500'}`}>PVW</Badge>
                      </div>
                    </div>
                  ))}
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
                  {audioChannels.slice(0, 4).map(channel => (
                    <div key={channel.id} className="flex items-center gap-4 group">
                      <span className="w-12 text-sm font-medium text-slate-600 dark:text-slate-400 truncate">{channel.name}</span>
                      <div className="flex-1 relative h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div 
                          className={`absolute top-0 left-0 h-full rounded-full transition-all duration-300 ${channel.mute ? 'bg-slate-300 dark:bg-slate-600' : channel.level > 85 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                          style={{ width: `${channel.level}%` }}
                        ></div>
                      </div>
                      <button className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${channel.mute ? 'bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400' : 'bg-slate-50 dark:bg-slate-700 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'}`}>
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
