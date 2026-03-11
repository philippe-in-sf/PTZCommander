import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Joystick } from "@/components/ptz/joystick";
import { CameraSelector } from "@/components/ptz/camera-selector";
import { PresetGrid } from "@/components/ptz/preset-grid";
import { LensControls } from "@/components/ptz/lens-controls";
import { MixerPanel } from "@/components/mixer/mixer-panel";
import { AtemPanel } from "@/components/switcher/atem-panel";
import { SceneButtons } from "@/components/ptz/scene-buttons";
import { CameraPreview } from "@/components/ptz/camera-preview";
import { LogViewer } from "@/components/logs/log-viewer";
import { LayoutSelector } from "@/components/layouts/layout-selector";
import { ChangelogDialog } from "@/components/changelog-dialog";
import { Settings, Power, Video, Wifi, WifiOff, Plus, SlidersHorizontal } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import { cameraApi, presetApi } from "@/lib/api";
import { useWebSocket } from "@/lib/websocket";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Link } from "wouter";
import type { Camera } from "@shared/schema";

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [addCameraOpen, setAddCameraOpen] = useState(false);
  const [newCamera, setNewCamera] = useState({ name: "", ip: "", port: 52381, streamUrl: "" });

  const ws = useWebSocket();

  const { data: cameras = [], isLoading } = useQuery({
    queryKey: ["cameras"],
    queryFn: cameraApi.getAll,
    refetchInterval: 5000,
  });

  const { data: presets = [] } = useQuery({
    queryKey: ["presets", selectedId],
    queryFn: () => selectedId ? cameraApi.getPresets(selectedId) : Promise.resolve([]),
    enabled: !!selectedId,
  });

  useEffect(() => {
    if (cameras.length > 0 && !selectedId) {
      setSelectedId(cameras[0].id);
    }
  }, [cameras, selectedId]);

  const createCameraMutation = useMutation({
    mutationFn: cameraApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cameras"] });
      setAddCameraOpen(false);
      setNewCamera({ name: "", ip: "", port: 52381, streamUrl: "" });
      toast.success("Camera added successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

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

  const savePresetMutation = useMutation({
    mutationFn: presetApi.save,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["presets", selectedId] });
      toast.success("Preset saved");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const recallPresetMutation = useMutation({
    mutationFn: presetApi.recall,
    onSuccess: () => {
      toast.success("Preset recalled");
    },
  });

  const selectedCam = cameras.find(c => c.id === selectedId);

  const handleJoystickMove = (x: number, y: number) => {
    if (selectedId) {
      ws.panTilt(selectedId, x, y, 0.5);
    }
  };

  const handleJoystickStop = () => {
    if (selectedId) {
      ws.panTiltStop(selectedId);
    }
  };

  const handleSelect = (id: number) => {
    setSelectedId(id);
  };

  const handleRecallPreset = (index: number) => {
    const preset = presets.find(p => p.presetNumber === index);
    if (preset) {
      recallPresetMutation.mutate(preset.id);
      if (selectedId && ws) {
        ws.recallPreset(selectedId, index);
      }
    }
  };

  const handleStorePreset = (index: number) => {
    if (!selectedId) return;
    
    savePresetMutation.mutate({
      cameraId: selectedId,
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
      streamUrl: newCamera.streamUrl || null,
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-slate-500 dark:text-slate-400 font-mono">Initializing PTZ Command...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col overflow-hidden">
      <header className="h-14 border-b border-border bg-slate-200/80 dark:bg-slate-950/50 backdrop-blur-md flex items-center justify-between px-6 z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.4)]">
            <Video className="text-white w-4 h-4" />
          </div>
          <div>
            <h1 className="font-bold tracking-tight text-lg leading-none">
              PTZ<span className="text-cyan-500 font-light">COMMAND</span>
            </h1>
            <ChangelogDialog />
          </div>

          <nav className="flex items-center gap-1 ml-6">
            <button className="px-3 py-1.5 rounded text-sm font-medium text-slate-900 dark:text-white bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700" data-testid="nav-dashboard">
              Dashboard
            </button>
            <Link href="/scenes">
              <button className="px-3 py-1.5 rounded text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors" data-testid="nav-scenes">
                Scenes
              </button>
            </Link>
            <Link href="/switcher">
              <button className="px-3 py-1.5 rounded text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors" data-testid="nav-switcher">
                Video Switcher
              </button>
            </Link>
            <Link href="/mixer">
              <button className="px-3 py-1.5 rounded text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors" data-testid="nav-mixer">
                Audio Mixer
              </button>
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <div className={cn(
            "flex items-center gap-2 text-xs font-mono px-3 py-1.5 rounded-md border",
            ws ? "text-emerald-600 dark:text-emerald-500 bg-emerald-100/50 dark:bg-emerald-950/30 border-emerald-300/50 dark:border-emerald-900/50" : "text-red-600 dark:text-red-500 bg-red-100/50 dark:bg-red-950/30 border-red-300/50 dark:border-red-900/50"
          )}>
            {ws ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {ws ? "SYSTEM ONLINE" : "DISCONNECTED"}
          </div>
          <ThemeToggle />
          <LayoutSelector />
          <LogViewer />
        </div>
      </header>

      <main className="flex-1 p-6 flex flex-col gap-6 max-w-7xl mx-auto w-full">
        
        {/* Scene Buttons - quick access at the top */}
        <section>
          <SceneButtons />
        </section>

        {/* ATEM & Mixer Summary */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <AtemPanel />
          <MixerPanel />
        </section>

        {/* Camera Preview */}
        {cameras.length > 0 && (
          <section>
            <CameraPreview
              cameras={cameras}
              selectedId={selectedId}
              onSelect={handleSelect}
            />
          </section>
        )}

        {/* Camera Strip */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-mono uppercase text-slate-500 dark:text-slate-500 tracking-widest">Camera Select</h2>
            <Dialog open={addCameraOpen} onOpenChange={setAddCameraOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-xs" data-testid="button-add-camera">
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
                      data-testid="input-new-camera-name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="ip">IP Address</Label>
                    <Input
                      id="ip"
                      value={newCamera.ip}
                      onChange={(e) => setNewCamera({ ...newCamera, ip: e.target.value })}
                      placeholder="192.168.10.101"
                      data-testid="input-new-camera-ip"
                    />
                  </div>
                  <div>
                    <Label htmlFor="port">Port</Label>
                    <Input
                      id="port"
                      type="number"
                      value={newCamera.port}
                      onChange={(e) => setNewCamera({ ...newCamera, port: parseInt(e.target.value) })}
                      data-testid="input-new-camera-port"
                    />
                  </div>
                  <div>
                    <Label htmlFor="stream-url">Snapshot URL (optional)</Label>
                    <Input
                      id="stream-url"
                      value={newCamera.streamUrl}
                      onChange={(e) => setNewCamera({ ...newCamera, streamUrl: e.target.value })}
                      placeholder="http://192.168.0.27/cgi-bin/snapshot.cgi"
                      data-testid="input-new-camera-stream-url"
                    />
                    <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                      HTTP URL for JPEG snapshot. Used for live preview.
                    </p>
                  </div>
                  <Button onClick={handleAddCamera} className="w-full" data-testid="button-save-new-camera">
                    Add Camera
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
           
          {cameras.length === 0 ? (
            <div className="border-2 border-dashed border-slate-300 dark:border-slate-800 rounded-xl p-12 text-center">
              <p className="text-slate-500 dark:text-slate-500 mb-4">No cameras configured</p>
              <Button onClick={() => setAddCameraOpen(true)} data-testid="button-add-first-camera">
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
                streamUrl: c.streamUrl,
                atemInputId: c.atemInputId,
                tallyState: c.tallyState || 'off',
                status: c.status as 'online' | 'offline' | 'tally',
              }))}
              selectedId={selectedId || 0}
              onSelect={handleSelect}
              onUpdateCamera={(id, updates) => updateCameraMutation.mutate({ id, updates })}
              onDeleteCamera={(id) => deleteCameraMutation.mutate(id)}
            />
          )}
        </section>

        {/* Command Deck */}
        {cameras.length > 0 && selectedCam && (
          <section className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0">
            
            <div className="lg:col-span-5 flex flex-col gap-6">
              <div className="glass-panel rounded-2xl p-8 flex-1 flex flex-col items-center justify-center relative overflow-hidden group border-cyan-500/20">
                <div className="absolute inset-0 bg-[url('/src/assets/tech-grid.png')] bg-cover opacity-10 pointer-events-none mix-blend-overlay" />
                
                <div className="absolute top-4 left-4 font-mono text-xs text-cyan-600/70 dark:text-cyan-500/70 border border-cyan-500/30 px-2 py-1 rounded bg-cyan-100/30 dark:bg-cyan-950/30">
                  CONTROLLING: {selectedCam.name.toUpperCase()}
                </div>
                
                <Joystick 
                  className="border-cyan-500/30"
                  onMove={handleJoystickMove} 
                  onStop={handleJoystickStop}
                />

                <div className="mt-8 text-center space-y-1">
                   <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white tracking-widest">{selectedCam.name}</div>
                   <div className="text-xs font-mono text-cyan-500">{selectedCam.ip}</div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-3 flex flex-col gap-4">
              <div className="bg-slate-100/30 dark:bg-slate-900/30 border border-slate-300 dark:border-slate-800 rounded-xl p-4 flex-1">
                 <h3 className="text-xs font-mono uppercase text-slate-500 dark:text-slate-500 tracking-widest mb-4">Optical Controls</h3>
                 <LensControls 
                   onZoomChange={(v) => ws?.zoom(selectedId!, v / 50 - 1, 0.5)}
                   onFocusChange={(v) => console.log('Focus', v)}
                   onSpeedChange={(v) => console.log('Speed', v)}
                 />
                 
                 <div className="mt-6 grid grid-cols-2 gap-2">
                    <button className="h-12 border border-slate-300 dark:border-slate-700 rounded bg-slate-200/50 dark:bg-slate-800/50 hover:bg-slate-300 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white text-slate-500 dark:text-slate-400 text-xs font-bold transition-colors" data-testid="button-night-mode">
                      NIGHT MODE
                    </button>
                    <button className="h-12 border border-slate-300 dark:border-slate-700 rounded bg-slate-200/50 dark:bg-slate-800/50 hover:bg-slate-300 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white text-slate-500 dark:text-slate-400 text-xs font-bold transition-colors" data-testid="button-osd-menu">
                      OSD MENU
                    </button>
                    <button 
                      onClick={() => ws?.focusAuto(selectedId!)}
                      className="h-12 border border-slate-300 dark:border-slate-700 rounded bg-slate-200/50 dark:bg-slate-800/50 hover:bg-slate-300 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white text-slate-500 dark:text-slate-400 text-xs font-bold transition-colors col-span-2"
                      data-testid="button-auto-focus"
                    >
                      AUTO FOCUS
                    </button>
                 </div>
              </div>
            </div>

            <div className="lg:col-span-4 h-full min-h-[400px]">
              <PresetGrid 
                presets={presets}
                onRecall={handleRecallPreset}
                onStore={handleStorePreset}
              />
            </div>

          </section>
        )}
      </main>
    </div>
  );
}
