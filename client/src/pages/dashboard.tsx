import { useState } from "react";
import { Joystick } from "@/components/ptz/joystick";
import { CameraSelector, type CameraData } from "@/components/ptz/camera-selector";
import { PresetGrid } from "@/components/ptz/preset-grid";
import { LensControls } from "@/components/ptz/lens-controls";
import { Settings, Power, Video, Wifi, ArrowRightLeft } from "lucide-react";
import { cn } from "@/lib/utils";

// Mock Data
const MOCK_CAMERAS: CameraData[] = [
  { id: 1, name: "Stage Left", ip: "192.168.10.101", status: "online" },
  { id: 2, name: "Stage Right", ip: "192.168.10.102", status: "online" },
  { id: 3, name: "Center Wide", ip: "192.168.10.103", status: "online" },
  { id: 4, name: "Audience", ip: "192.168.10.104", status: "offline" },
];

export default function Dashboard() {
  const [previewId, setPreviewId] = useState<number>(2); // Default PVW
  const [programId, setProgramId] = useState<number>(1); // Default PGM

  const previewCam = MOCK_CAMERAS.find(c => c.id === previewId) || MOCK_CAMERAS[0];
  const programCam = MOCK_CAMERAS.find(c => c.id === programId) || MOCK_CAMERAS[0];

  const handleJoystickMove = (x: number, y: number) => {
    // Joystick controls PREVIEW camera by default for safety
    console.log(`[CAM ${previewId}] Pan: ${x.toFixed(2)}, Tilt: ${y.toFixed(2)}`);
  };

  const handleCut = () => {
    // Swap PVW to PGM
    const newProgramId = previewId;
    const newPreviewId = programId; // Flip-flop style, or just keep preview? usually flip-flop in cheap switchers, or stay on preview. 
    // Let's implement standard "Cut" where PVW becomes PGM, and PGM becomes PVW (Flip Flop)
    setProgramId(newProgramId);
    setPreviewId(newPreviewId);
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
        
        {/* Camera Strip & Transition */}
        <section className="flex gap-6 items-stretch">
          <div className="flex-1">
             <div className="flex items-center justify-between mb-2">
                <h2 className="text-xs font-mono uppercase text-slate-500 tracking-widest">Source Select (Click to Preview)</h2>
             </div>
             <CameraSelector 
               cameras={MOCK_CAMERAS} 
               previewId={previewId}
               programId={programId}
               onSelectPreview={setPreviewId}
               onSelectProgram={setProgramId}
             />
          </div>
          
          {/* Transition Button */}
          <div className="flex flex-col justify-end pb-0.5">
            <button 
              onClick={handleCut}
              className="h-32 w-24 rounded-lg bg-slate-800 border-2 border-slate-700 flex flex-col items-center justify-center gap-2 transition-all active:scale-95 hover:border-slate-500 hover:bg-slate-700 group"
            >
              <div className="text-xs font-mono text-slate-400 group-hover:text-white">TAKE</div>
              <ArrowRightLeft className="w-8 h-8 text-slate-500 group-hover:text-white" />
              <div className="w-16 h-1 bg-red-500/50 rounded-full mt-2 group-hover:bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]" />
            </button>
          </div>
        </section>

        {/* Command Deck */}
        <section className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0">
          
          {/* Left Column: Joystick & Movement */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            <div className="glass-panel rounded-2xl p-8 flex-1 flex flex-col items-center justify-center relative overflow-hidden group border-emerald-500/20">
              <div className="absolute inset-0 bg-[url('/src/assets/tech-grid.png')] bg-cover opacity-10 pointer-events-none mix-blend-overlay" />
              
              <div className="absolute top-4 left-4 font-mono text-xs text-emerald-500/70 border border-emerald-500/30 px-2 py-1 rounded bg-emerald-950/30">
                CONTROLLING: PREVIEW
              </div>
              
              <Joystick 
                className="border-emerald-500/30"
                onMove={handleJoystickMove} 
                onStop={() => console.log("Stop")}
              />

              <div className="mt-8 text-center space-y-1">
                 <div className="text-2xl font-bold font-mono text-white tracking-widest">{previewCam.name}</div>
                 <div className="text-xs font-mono text-emerald-500">{previewCam.ip}</div>
              </div>
            </div>
          </div>

          {/* Middle Column: Lens & Params */}
          <div className="lg:col-span-3 flex flex-col gap-4">
            <div className="bg-slate-900/30 border border-slate-800 rounded-xl p-4 flex-1">
               <h3 className="text-xs font-mono uppercase text-slate-500 tracking-widest mb-4">Optical Controls (PVW)</h3>
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
