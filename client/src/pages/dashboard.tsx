import { useState } from "react";
import { Joystick } from "@/components/ptz/joystick";
import { CameraSelector, type CameraData } from "@/components/ptz/camera-selector";
import { PresetGrid } from "@/components/ptz/preset-grid";
import { LensControls } from "@/components/ptz/lens-controls";
import { Settings, Power, Video, Wifi } from "lucide-react";

// Mock Data
const MOCK_CAMERAS: CameraData[] = [
  { id: 1, name: "Stage Left", ip: "192.168.10.101", status: "online" },
  { id: 2, name: "Stage Right", ip: "192.168.10.102", status: "online" },
  { id: 3, name: "Center Wide", ip: "192.168.10.103", status: "tally" },
  { id: 4, name: "Audience", ip: "192.168.10.104", status: "offline" },
];

export default function Dashboard() {
  const [selectedCamId, setSelectedCamId] = useState<number>(1);
  const selectedCam = MOCK_CAMERAS.find(c => c.id === selectedCamId) || MOCK_CAMERAS[0];

  const handleJoystickMove = (x: number, y: number) => {
    // In a real app, this would throttle and send VISCA/Pelco commands
    console.log(`[CAM ${selectedCamId}] Pan: ${x.toFixed(2)}, Tilt: ${y.toFixed(2)}`);
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col overflow-hidden">
      {/* Top Bar */}
      <header className="h-14 border-b border-border bg-slate-950/50 backdrop-blur-md flex items-center justify-between px-6 z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.4)]">
            <Video className="text-white w-4 h-4" />
          </div>
          <h1 className="font-bold tracking-tight text-lg">
            PTZ<span className="text-cyan-500 font-light">COMMAND</span>
          </h1>
          <span className="ml-4 px-2 py-0.5 rounded-full bg-slate-800 text-[10px] font-mono text-slate-400 border border-slate-700">
            v2.4.0
          </span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs font-mono text-emerald-500 bg-emerald-950/30 px-3 py-1.5 rounded-md border border-emerald-900/50">
            <Wifi className="w-3 h-3" /> SYSTEM ONLINE
          </div>
          <button className="p-2 hover:bg-slate-800 rounded-full transition-colors">
            <Settings className="w-5 h-5 text-slate-400" />
          </button>
          <button className="p-2 hover:bg-red-900/20 rounded-full transition-colors group">
            <Power className="w-5 h-5 text-slate-400 group-hover:text-red-400" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6 flex flex-col gap-6 max-w-7xl mx-auto w-full">
        
        {/* Camera Strip */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-mono uppercase text-slate-500 tracking-widest">Select Source</h2>
          </div>
          <CameraSelector 
            cameras={MOCK_CAMERAS} 
            selectedId={selectedCamId} 
            onSelect={setSelectedCamId} 
          />
        </section>

        {/* Command Deck */}
        <section className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0">
          
          {/* Left Column: Joystick & Movement */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            <div className="glass-panel rounded-2xl p-8 flex-1 flex flex-col items-center justify-center relative overflow-hidden group">
              <div className="absolute inset-0 bg-[url('/src/assets/tech-grid.png')] bg-cover opacity-10 pointer-events-none mix-blend-overlay" />
              
              <div className="absolute top-4 left-4 font-mono text-xs text-slate-500">
                MANUAL OVERRIDE
              </div>
              
              <Joystick 
                onMove={handleJoystickMove} 
                onStop={() => console.log("Stop")}
              />

              <div className="mt-8 text-center space-y-1">
                 <div className="text-2xl font-bold font-mono text-white tracking-widest">{selectedCam.name}</div>
                 <div className="text-xs font-mono text-cyan-500">{selectedCam.ip}</div>
              </div>
            </div>
          </div>

          {/* Middle Column: Lens & Params */}
          <div className="lg:col-span-3 flex flex-col gap-4">
            <div className="bg-slate-900/30 border border-slate-800 rounded-xl p-4 flex-1">
               <h3 className="text-xs font-mono uppercase text-slate-500 tracking-widest mb-4">Optical Controls</h3>
               <LensControls 
                 onZoomChange={(v) => console.log('Zoom', v)}
                 onFocusChange={(v) => console.log('Focus', v)}
                 onSpeedChange={(v) => console.log('Speed', v)}
               />
               
               {/* Quick Actions */}
               <div className="mt-6 grid grid-cols-2 gap-2">
                  <button className="h-12 border border-slate-700 rounded bg-slate-800/50 hover:bg-slate-700 hover:text-white text-slate-400 text-xs font-bold transition-colors">
                    NIGHT MODE
                  </button>
                  <button className="h-12 border border-slate-700 rounded bg-slate-800/50 hover:bg-slate-700 hover:text-white text-slate-400 text-xs font-bold transition-colors">
                    OSD MENU
                  </button>
                  <button className="h-12 border border-slate-700 rounded bg-slate-800/50 hover:bg-slate-700 hover:text-white text-slate-400 text-xs font-bold transition-colors col-span-2">
                    RECALIBRATE MOTORS
                  </button>
               </div>
            </div>
          </div>

          {/* Right Column: Presets */}
          <div className="lg:col-span-4 h-full min-h-[400px]">
            <PresetGrid 
              onRecall={(i) => console.log(`Recalling preset ${i}`)}
              onStore={(i) => console.log(`Storing preset ${i}`)}
            />
          </div>

        </section>
      </main>
    </div>
  );
}
