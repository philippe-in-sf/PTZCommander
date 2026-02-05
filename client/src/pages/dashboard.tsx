import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Joystick } from "@/components/ptz/joystick";
import { CameraSelector } from "@/components/ptz/camera-selector";
import { PresetGrid } from "@/components/ptz/preset-grid";
import { LensControls } from "@/components/ptz/lens-controls";
import { MixerPanel } from "@/components/mixer/mixer-panel";
import { AtemPanel } from "@/components/switcher/atem-panel";
import { LogViewer } from "@/components/logs/log-viewer";
import { Settings, Power, Video, Wifi, WifiOff, ArrowRightLeft, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { cameraApi, presetApi } from "@/lib/api";
import { useWebSocket } from "@/lib/websocket";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { Camera } from "@shared/schema";

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [programId, setProgramId] = useState<number | null>(null);
  const [addCameraOpen, setAddCameraOpen] = useState(false);
  const [newCamera, setNewCamera] = useState({ name: "", ip: "", port: 52381 });

  // WebSocket connection (auto-detects protocol)
  const ws = useWebSocket();

  // Fetch cameras
  const { data: cameras = [], isLoading } = useQuery({
    queryKey: ["cameras"],
    queryFn: cameraApi.getAll,
    refetchInterval: 5000, // Refresh every 5 seconds to update status
  });

  // Fetch presets for preview camera
  const { data: presets = [] } = useQuery({
    queryKey: ["presets", previewId],
    queryFn: () => previewId ? cameraApi.getPresets(previewId) : Promise.resolve([]),
    enabled: !!previewId,
  });

  // Initialize preview and program on first load
  useEffect(() => {
    if (cameras.length > 0 && !previewId && !programId) {
      const programCam = cameras.find(c => c.isProgramOutput);
      const previewCam = cameras.find(c => c.isPreviewOutput);
      
      if (programCam) setProgramId(programCam.id);
      else if (cameras[0]) setProgramId(cameras[0].id);
      
      if (previewCam) setPreviewId(previewCam.id);
      else if (cameras[1]) setPreviewId(cameras[1].id);
      else if (cameras[0]) setPreviewId(cameras[0].id);
    }
  }, [cameras, previewId, programId]);

  // Create camera mutation
  const createCameraMutation = useMutation({
    mutationFn: cameraApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cameras"] });
      setAddCameraOpen(false);
      setNewCamera({ name: "", ip: "", port: 52381 });
      toast.success("Camera added successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Set preview mutation
  const setPreviewMutation = useMutation({
    mutationFn: cameraApi.setPreview,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cameras"] });
    },
  });

  // Set program mutation
  const setProgramMutation = useMutation({
    mutationFn: cameraApi.setProgram,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cameras"] });
    },
  });

  // Update camera mutation
  const updateCameraMutation = useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: Partial<Camera> }) => 
      cameraApi.update(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cameras"] });
      toast.success("Camera updated");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Delete camera mutation
  const deleteCameraMutation = useMutation({
    mutationFn: cameraApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cameras"] });
      toast.success("Camera deleted");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Save preset mutation
  const savePresetMutation = useMutation({
    mutationFn: presetApi.save,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["presets", previewId] });
      toast.success("Preset saved");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Recall preset mutation
  const recallPresetMutation = useMutation({
    mutationFn: presetApi.recall,
    onSuccess: () => {
      toast.success("Preset recalled");
    },
  });

  const previewCam = cameras.find(c => c.id === previewId);
  const programCam = cameras.find(c => c.id === programId);

  const handleJoystickMove = (x: number, y: number) => {
    if (previewId && ws) {
      ws.panTilt(previewId, x, y, 0.5);
    }
  };

  const handleJoystickStop = () => {
    if (previewId && ws) {
      ws.panTiltStop(previewId);
    }
  };

  const handleCut = () => {
    if (!previewId || !programId) return;
    
    const newProgramId = previewId;
    const newPreviewId = programId;
    
    setProgramId(newProgramId);
    setPreviewId(newPreviewId);
    
    setProgramMutation.mutate(newProgramId);
    setPreviewMutation.mutate(newPreviewId);
  };

  const handleSelectPreview = (id: number) => {
    setPreviewId(id);
    setPreviewMutation.mutate(id);
  };

  const handleSelectProgram = (id: number) => {
    setProgramId(id);
    setProgramMutation.mutate(id);
  };

  const handleRecallPreset = (index: number) => {
    const preset = presets.find(p => p.presetNumber === index);
    if (preset) {
      recallPresetMutation.mutate(preset.id);
      if (previewId && ws) {
        ws.recallPreset(previewId, index);
      }
    }
  };

  const handleStorePreset = (index: number) => {
    if (!previewId) return;
    
    savePresetMutation.mutate({
      cameraId: previewId,
      presetNumber: index,
      name: `Preset ${index + 1}`,
      pan: 0,
      tilt: 0,
      zoom: 0,
      focus: 0,
    });
  };

  const handleAddCamera = () => {
    createCameraMutation.mutate({
      name: newCamera.name,
      ip: newCamera.ip,
      port: newCamera.port,
      protocol: "visca",
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-slate-400 font-mono">Initializing PTZ Command...</p>
        </div>
      </div>
    );
  }

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
          <div className={cn(
            "flex items-center gap-2 text-xs font-mono px-3 py-1.5 rounded-md border",
            ws ? "text-emerald-500 bg-emerald-950/30 border-emerald-900/50" : "text-red-500 bg-red-950/30 border-red-900/50"
          )}>
            {ws ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {ws ? "SYSTEM ONLINE" : "DISCONNECTED"}
          </div>
          <LogViewer />
          <button className="p-2 hover:bg-slate-800 rounded-full transition-colors">
            <Settings className="w-5 h-5 text-slate-400" />
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
                <Dialog open={addCameraOpen} onOpenChange={setAddCameraOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="text-xs">
                      <Plus className="w-3 h-3 mr-1" /> Add Camera
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add PTZ Camera</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="name">Camera Name</Label>
                        <Input
                          id="name"
                          value={newCamera.name}
                          onChange={(e) => setNewCamera({ ...newCamera, name: e.target.value })}
                          placeholder="Stage Left"
                        />
                      </div>
                      <div>
                        <Label htmlFor="ip">IP Address</Label>
                        <Input
                          id="ip"
                          value={newCamera.ip}
                          onChange={(e) => setNewCamera({ ...newCamera, ip: e.target.value })}
                          placeholder="192.168.10.101"
                        />
                      </div>
                      <div>
                        <Label htmlFor="port">Port</Label>
                        <Input
                          id="port"
                          type="number"
                          value={newCamera.port}
                          onChange={(e) => setNewCamera({ ...newCamera, port: parseInt(e.target.value) })}
                        />
                      </div>
                      <Button onClick={handleAddCamera} className="w-full">
                        Add Camera
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
             </div>
             
             {cameras.length === 0 ? (
               <div className="border-2 border-dashed border-slate-800 rounded-xl p-12 text-center">
                 <p className="text-slate-500 mb-4">No cameras configured</p>
                 <Button onClick={() => setAddCameraOpen(true)}>
                   <Plus className="w-4 h-4 mr-2" /> Add Your First Camera
                 </Button>
               </div>
             ) : (
               <CameraSelector 
                 cameras={cameras.map(c => ({
                   id: c.id,
                   name: c.name,
                   ip: c.ip,
                   port: c.port,
                   status: c.status as 'online' | 'offline' | 'tally',
                 }))}
                 previewId={previewId || 0}
                 programId={programId || 0}
                 onSelectPreview={handleSelectPreview}
                 onSelectProgram={handleSelectProgram}
                 onUpdateCamera={(id, updates) => updateCameraMutation.mutate({ id, updates })}
                 onDeleteCamera={(id) => deleteCameraMutation.mutate(id)}
               />
             )}
          </div>
          
          {/* Transition Button */}
          {cameras.length > 0 && (
            <div className="flex flex-col justify-end pb-0.5">
              <button 
                onClick={handleCut}
                disabled={!previewId || !programId}
                className="h-32 w-24 rounded-lg bg-slate-800 border-2 border-slate-700 flex flex-col items-center justify-center gap-2 transition-all active:scale-95 hover:border-slate-500 hover:bg-slate-700 group disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="button-take"
              >
                <div className="text-xs font-mono text-slate-400 group-hover:text-white">TAKE</div>
                <ArrowRightLeft className="w-8 h-8 text-slate-500 group-hover:text-white" />
                <div className="w-16 h-1 bg-red-500/50 rounded-full mt-2 group-hover:bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]" />
              </button>
            </div>
          )}
        </section>

        {/* Command Deck */}
        {cameras.length > 0 && previewCam && (
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
                  onStop={handleJoystickStop}
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
                   onZoomChange={(v) => ws?.zoom(previewId!, v / 50 - 1, 0.5)}
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
                    <button 
                      onClick={() => ws?.focusAuto(previewId!)}
                      className="h-12 border border-slate-700 rounded bg-slate-800/50 hover:bg-slate-700 hover:text-white text-slate-400 text-xs font-bold transition-colors col-span-2"
                    >
                      AUTO FOCUS
                    </button>
                 </div>
              </div>
            </div>

            {/* Right Column: Presets */}
            <div className="lg:col-span-4 h-full min-h-[400px]">
              <PresetGrid 
                presets={presets}
                onRecall={handleRecallPreset}
                onStore={handleStorePreset}
              />
            </div>

          </section>
        )}

        {/* External Hardware Section */}
        <section className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <AtemPanel />
          <MixerPanel />
        </section>
      </main>
    </div>
  );
}
