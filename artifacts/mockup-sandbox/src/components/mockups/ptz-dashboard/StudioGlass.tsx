import React, { useState } from "react";
import { 
  Camera, 
  Video, 
  Mic, 
  Lightbulb, 
  LayoutDashboard, 
  Settings2, 
  Layers,
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

// Mock Data
const cameras = [
  { id: 1, name: "Stage Left", status: "online", tally: "program", image: "https://images.unsplash.com/photo-1598555353066-681b4fc64fbe?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3" },
  { id: 2, name: "Stage Right", status: "online", tally: "preview", image: "https://images.unsplash.com/photo-1516280440503-6c174f85e505?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3" },
  { id: 3, name: "Pulpit", status: "online", tally: "none", image: "https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3" },
  { id: 4, name: "Wide Shot", status: "offline", tally: "none", image: "https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3" },
];

const scenes = ["Pre-Service", "Worship", "Sermon", "Altar Call", "Post-Service", "Emergency"];
const presets = Array.from({ length: 16 }, (_, i) => ({ id: i + 1, name: `Preset ${i + 1}` }));
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

// Reusable Glass Panel Component
const GlassPanel = ({ children, className = "" }: { children: React.ReactNode, className?: string }) => (
  <div className={`bg-white/70 backdrop-blur-xl border border-white/50 shadow-xl rounded-3xl ${className}`}>
    {children}
  </div>
);

export function StudioGlass() {
  const [activeCamera, setActiveCamera] = useState(1);
  const [zoomValue, setZoomValue] = useState([50]);
  const [focusValue, setFocusValue] = useState([50]);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 font-sans flex">
      {/* Sidebar Navigation */}
      <aside className="w-64 h-screen fixed left-0 top-0 p-6 flex flex-col gap-8 z-10">
        <div className="flex items-center gap-3 px-2">
          <div className="w-10 h-10 rounded-xl bg-indigo-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/30">
            <Radio className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-bold text-xl tracking-tight text-slate-900">PTZCOMMAND</h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
              <span className="text-xs font-medium text-slate-500">System Online</span>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-2">
          {[
            { icon: LayoutDashboard, label: "Dashboard", active: true },
            { icon: Layers, label: "Scenes", active: false },
            { icon: Settings2, label: "Macros", active: false },
            { icon: Video, label: "Video Switcher", active: false },
            { icon: Mic, label: "Audio Mixer", active: false },
            { icon: Lightbulb, label: "Lighting", active: false },
          ].map((item, i) => (
            <button
              key={i}
              className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all duration-200 font-medium ${
                item.active 
                  ? "bg-indigo-50 text-indigo-600 shadow-sm" 
                  : "text-slate-500 hover:bg-slate-100/50 hover:text-slate-800"
              }`}
            >
              <item.icon className={`w-5 h-5 ${item.active ? "text-indigo-600" : "text-slate-400"}`} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="mt-auto">
          <GlassPanel className="p-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
              <Activity className="w-4 h-4 text-slate-500" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-800">System Health</p>
              <p className="text-xs text-slate-500">All services nominal</p>
            </div>
          </GlassPanel>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-64 p-6 lg:p-10 space-y-8 h-screen overflow-y-auto">
        
        {/* Scenes Strip */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-800">Quick Scenes</h2>
            <Button variant="ghost" className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-full h-8 px-4 text-xs font-semibold">
              Edit Scenes
            </Button>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-2 -mx-2 px-2 snap-x">
            {scenes.map((scene, i) => (
              <button 
                key={i} 
                className={`snap-start whitespace-nowrap px-6 py-3.5 rounded-full font-medium transition-all shadow-sm border ${
                  i === 0 
                    ? "bg-slate-800 text-white border-slate-800 hover:bg-slate-900 shadow-slate-900/20" 
                    : "bg-white text-slate-600 border-white/50 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                {scene}
              </button>
            ))}
          </div>
        </section>

        {/* Camera Selector */}
        <section>
          <h2 className="text-lg font-bold text-slate-800 mb-4">Camera Select</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {cameras.map((cam) => (
              <button
                key={cam.id}
                onClick={() => setActiveCamera(cam.id)}
                className={`group relative text-left rounded-3xl p-1.5 transition-all duration-300 ${
                  activeCamera === cam.id 
                    ? "bg-indigo-500 shadow-xl shadow-indigo-500/20 scale-[1.02]" 
                    : "bg-white/50 hover:bg-white/80 hover:shadow-lg"
                }`}
              >
                <div className={`relative h-32 rounded-2xl overflow-hidden mb-3 ${activeCamera === cam.id ? "ring-2 ring-white/20" : ""}`}>
                  {/* Pseudo image overlay */}
                  <div className="absolute inset-0 bg-slate-200" style={{ backgroundImage: `url(${cam.image})`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: cam.status === 'offline' ? 0.3 : 1 }}></div>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/0"></div>
                  
                  {/* Status Badges */}
                  <div className="absolute top-3 left-3 flex gap-2">
                    {cam.tally === "program" && (
                      <Badge className="bg-rose-500 hover:bg-rose-600 text-white border-0 shadow-md px-2 py-0.5">PGM</Badge>
                    )}
                    {cam.tally === "preview" && (
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
                  <h3 className={`font-semibold text-base mb-1 ${activeCamera === cam.id ? "text-white" : "text-slate-800"}`}>
                    {cam.name}
                  </h3>
                  <p className={`text-xs flex items-center gap-1.5 ${activeCamera === cam.id ? "text-indigo-100" : "text-slate-500"}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${cam.status === 'online' ? 'bg-emerald-400' : 'bg-slate-300'}`}></span>
                    {cam.status === 'online' ? 'Connected' : 'Disconnected'}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Control Desk */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* PTZ Joystick & Lens */}
          <div className="lg:col-span-5 space-y-8">
            <GlassPanel className="p-8">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-xl font-bold text-slate-800">PTZ Control</h2>
                  <p className="text-sm text-slate-500">Stage Left • Cam 1</p>
                </div>
                <Button variant="ghost" size="icon" className="rounded-full w-10 h-10 bg-slate-100 text-slate-500 hover:text-slate-900">
                  <Settings2 className="w-5 h-5" />
                </Button>
              </div>

              {/* Joystick */}
              <div className="flex justify-center mb-10">
                <div className="relative w-56 h-56 rounded-full bg-slate-100 border-4 border-white shadow-inner flex items-center justify-center">
                  <div className="absolute top-4 text-slate-400 hover:text-indigo-500 cursor-pointer transition-colors"><ChevronUp className="w-8 h-8" /></div>
                  <div className="absolute bottom-4 text-slate-400 hover:text-indigo-500 cursor-pointer transition-colors"><ChevronDown className="w-8 h-8" /></div>
                  <div className="absolute left-4 text-slate-400 hover:text-indigo-500 cursor-pointer transition-colors"><ChevronLeft className="w-8 h-8" /></div>
                  <div className="absolute right-4 text-slate-400 hover:text-indigo-500 cursor-pointer transition-colors"><ChevronRight className="w-8 h-8" /></div>
                  
                  {/* Stick */}
                  <div className="w-24 h-24 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 shadow-[0_10px_30px_rgba(99,102,241,0.5)] border-2 border-indigo-300/50 flex items-center justify-center cursor-move hover:scale-105 transition-transform active:scale-95">
                    <CircleDot className="w-8 h-8 text-white/50" />
                  </div>
                </div>
              </div>

              {/* Zoom & Focus */}
              <div className="space-y-6">
                <div className="space-y-3">
                  <div className="flex justify-between text-sm font-medium text-slate-600">
                    <span className="flex items-center gap-1.5"><Maximize className="w-4 h-4" /> Zoom</span>
                    <span>{zoomValue}%</span>
                  </div>
                  <Slider 
                    value={zoomValue} 
                    onValueChange={setZoomValue} 
                    max={100} step={1} 
                    className="[&_[role=slider]]:bg-indigo-600 [&_[role=slider]]:border-indigo-600 [&_[role=slider]]:shadow-lg"
                  />
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm font-medium text-slate-600">
                    <span className="flex items-center gap-1.5"><Focus className="w-4 h-4" /> Focus</span>
                    <span>{focusValue}%</span>
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

          {/* Presets & Production Tools */}
          <div className="lg:col-span-7 space-y-8">
            
            {/* Presets */}
            <GlassPanel className="p-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-slate-800">Presets</h2>
                <Tabs defaultValue="grid" className="w-[120px]">
                  <TabsList className="grid w-full grid-cols-2 bg-slate-100 rounded-full h-9 p-1">
                    <TabsTrigger value="grid" className="rounded-full text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm">Grid</TabsTrigger>
                    <TabsTrigger value="list" className="rounded-full text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm">List</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              
              <div className="grid grid-cols-4 gap-3">
                {presets.map((preset) => (
                  <button 
                    key={preset.id}
                    className="h-16 rounded-2xl bg-slate-50 border border-slate-100 hover:bg-white hover:shadow-md hover:border-indigo-100 transition-all flex flex-col items-center justify-center gap-1 text-slate-600 hover:text-indigo-600 group"
                  >
                    <span className="text-xs font-bold text-slate-400 group-hover:text-indigo-300 transition-colors">{preset.id.toString().padStart(2, '0')}</span>
                    <span className="text-sm font-medium">{preset.name}</span>
                  </button>
                ))}
              </div>
            </GlassPanel>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* ATEM Summary */}
              <GlassPanel className="p-6 flex flex-col">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-8 h-8 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center">
                    <MonitorPlay className="w-4 h-4" />
                  </div>
                  <h3 className="font-bold text-slate-800">ATEM Switcher</h3>
                </div>
                
                <div className="space-y-3 flex-1">
                  {atemInputs.slice(0, 4).map(input => (
                    <div key={input.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50/50 hover:bg-white transition-colors">
                      <span className="font-medium text-slate-700 text-sm">{input.name}</span>
                      <div className="flex gap-2">
                        <Badge className={`w-10 flex justify-center py-1 ${input.status === 'program' ? 'bg-rose-500 hover:bg-rose-600' : 'bg-slate-200 text-slate-400 hover:bg-slate-300'}`}>PGM</Badge>
                        <Badge className={`w-10 flex justify-center py-1 ${input.status === 'preview' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-slate-200 text-slate-400 hover:bg-slate-300'}`}>PVW</Badge>
                      </div>
                    </div>
                  ))}
                </div>
                <Button variant="outline" className="w-full mt-4 rounded-xl border-slate-200 text-slate-600 hover:bg-slate-50">View Full Switcher</Button>
              </GlassPanel>

              {/* Audio Mixer Summary */}
              <GlassPanel className="p-6 flex flex-col">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center">
                    <SlidersHorizontal className="w-4 h-4" />
                  </div>
                  <h3 className="font-bold text-slate-800">Audio Levels</h3>
                </div>
                
                <div className="space-y-4 flex-1 mt-2">
                  {audioChannels.slice(0, 4).map(channel => (
                    <div key={channel.id} className="flex items-center gap-4 group">
                      <span className="w-12 text-sm font-medium text-slate-600 truncate">{channel.name}</span>
                      <div className="flex-1 relative h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className={`absolute top-0 left-0 h-full rounded-full transition-all duration-300 ${channel.mute ? 'bg-slate-300' : channel.level > 85 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                          style={{ width: `${channel.level}%` }}
                        ></div>
                      </div>
                      <button className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${channel.mute ? 'bg-rose-100 text-rose-600' : 'bg-slate-50 text-slate-400 hover:bg-slate-200'}`}>
                        M
                      </button>
                    </div>
                  ))}
                </div>
                <Button variant="outline" className="w-full mt-4 rounded-xl border-slate-200 text-slate-600 hover:bg-slate-50">View Full Mixer</Button>
              </GlassPanel>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}

export default StudioGlass;
