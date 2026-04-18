import { useState, useEffect, lazy, Suspense } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Joystick } from "@/components/ptz/joystick";
import { CameraSelector } from "@/components/ptz/camera-selector";
import { PresetGrid } from "@/components/ptz/preset-grid";
import { LensControls } from "@/components/ptz/lens-controls";
import { MixerPanel } from "@/components/mixer/mixer-panel";
import { AtemPanel } from "@/components/switcher/atem-panel";
import { HuePanel } from "@/components/lighting/hue-panel";
import { SceneButtons } from "@/components/ptz/scene-buttons";
import { CameraMonitor, CameraPreview } from "@/components/ptz/camera-preview";
import { LogViewer } from "@/components/logs/log-viewer";
import { SessionLog } from "@/components/logs/session-log";
import { LayoutSelector } from "@/components/layouts/layout-selector";
import { ConnectionHealth } from "@/components/ptz/connection-health";
import { ChangelogDialog } from "@/components/changelog-dialog";
import { SkinSelector } from "@/components/skin-selector";
import { useSkin } from "@/lib/skin-context";
import { Video, Wifi, WifiOff, Plus, Undo2, Search, Loader2 } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import { cameraApi, presetApi, undoApi, type DiscoveredCamera } from "@/lib/api";
import { useWebSocket } from "@/lib/websocket";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Link } from "wouter";
import type { Camera } from "@shared/schema";

const BroadcastConsole = lazy(() => import("@/components/skins/broadcast-console"));
const StudioGlass = lazy(() => import("@/components/skins/studio-glass"));
const CommandCenter = lazy(() => import("@/components/skins/command-center"));

const FIRST_RUN_DISCOVERY_KEY = "ptz.discovery.firstRunPrompted";
type PreviewType = "none" | "snapshot" | "mjpeg" | "webrtc" | "browser";

function discoveredCameraKey(camera: Pick<DiscoveredCamera, "ip" | "port">) {
  return `${camera.ip}:${camera.port}`;
}

function parseDiscoveryPorts(value: string) {
  const ports = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map(Number);

  if (ports.some((port) => !Number.isInteger(port) || port < 1 || port > 65535)) {
    throw new Error("Ports must be comma-separated numbers from 1 to 65535");
  }

  return Array.from(new Set(ports));
}

export default function Dashboard() {
  const queryClient = useQueryClient();
  const { skin } = useSkin();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [addCameraOpen, setAddCameraOpen] = useState(false);
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [discoverySubnet, setDiscoverySubnet] = useState("");
  const [discoveryPorts, setDiscoveryPorts] = useState("52381, 1259, 5678");
  const [selectedDiscovered, setSelectedDiscovered] = useState<Set<string>>(new Set());
  const [hasAutoPromptedDiscovery, setHasAutoPromptedDiscovery] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem(FIRST_RUN_DISCOVERY_KEY) === "true";
  });
  const [hasAutoScannedDiscovery, setHasAutoScannedDiscovery] = useState(false);
  const [newCamera, setNewCamera] = useState<{ name: string; ip: string; port: number; streamUrl: string; previewType: PreviewType; previewRefreshMs: number }>({
    name: "",
    ip: "",
    port: 52381,
    streamUrl: "",
    previewType: "none",
    previewRefreshMs: 2000,
  });
  const [panTiltSpeed, setPanTiltSpeed] = useState(0.5);

  const ws = useWebSocket();

  const { data: cameras = [], isLoading } = useQuery({
    queryKey: ["cameras"],
    queryFn: cameraApi.getAll,
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

  const { data: undoStatus } = useQuery({
    queryKey: ["undo-status"],
    queryFn: undoApi.getStatus,
  });

  const undoMutation = useMutation({
    mutationFn: undoApi.undo,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["undo-status"] });
      queryClient.invalidateQueries({ queryKey: ["cameras"] });
      queryClient.invalidateQueries({ queryKey: ["presets"] });
      toast.success(data.message);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createCameraMutation = useMutation({
    mutationFn: cameraApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cameras"] });
      setAddCameraOpen(false);
      setNewCamera({ name: "", ip: "", port: 52381, streamUrl: "", previewType: "none", previewRefreshMs: 2000 });
      toast.success("Camera added successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const discoverCamerasMutation = useMutation({
    mutationFn: () => {
      const ports = parseDiscoveryPorts(discoveryPorts);
      return cameraApi.discover({
        subnet: discoverySubnet.trim() || undefined,
        ports: ports.length > 0 ? ports : undefined,
      });
    },
    onSuccess: (data) => {
      const selectable = data.cameras.filter((camera) => !camera.alreadyConfigured);
      setSelectedDiscovered(new Set(selectable.map(discoveredCameraKey)));
      if (data.cameras.length === 0) {
        toast.info("No VISCA cameras found");
      } else {
        toast.success(`Found ${data.cameras.length} camera candidate${data.cameras.length === 1 ? "" : "s"}`);
      }
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const importDiscoveredMutation = useMutation({
    mutationFn: () => {
      const selected = discoverCamerasMutation.data?.cameras.filter((camera) =>
        selectedDiscovered.has(discoveredCameraKey(camera)) && !camera.alreadyConfigured
      ) || [];

      if (selected.length === 0) {
        throw new Error("Select at least one discovered camera");
      }

      return cameraApi.importDiscovered(selected.map((camera) => ({
        ip: camera.ip,
        port: camera.port,
        name: camera.name,
      })));
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["cameras"] });
      if (data.added.length > 0) {
        setDiscoverOpen(false);
        toast.success(`Added ${data.added.length} camera${data.added.length === 1 ? "" : "s"}`);
      } else {
        toast.info("No new cameras added");
      }
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

  useEffect(() => {
    if (isLoading || cameras.length > 0 || hasAutoPromptedDiscovery) return;

    setDiscoverOpen(true);
    setHasAutoPromptedDiscovery(true);
    window.localStorage.setItem(FIRST_RUN_DISCOVERY_KEY, "true");
  }, [cameras.length, hasAutoPromptedDiscovery, isLoading]);

  useEffect(() => {
    if (!discoverOpen || cameras.length > 0 || hasAutoScannedDiscovery || discoverCamerasMutation.isPending || discoverCamerasMutation.data) return;

    setHasAutoScannedDiscovery(true);
    discoverCamerasMutation.mutate();
  }, [cameras.length, discoverCamerasMutation, discoverOpen, hasAutoScannedDiscovery]);

  const selectedCam = cameras.find(c => c.id === selectedId);
  const discoveredCameras = discoverCamerasMutation.data?.cameras || [];
  const selectedDiscoveredCount = discoveredCameras.filter((camera) =>
    selectedDiscovered.has(discoveredCameraKey(camera)) && !camera.alreadyConfigured
  ).length;

  const toggleDiscoveredCamera = (camera: DiscoveredCamera, checked: boolean) => {
    const key = discoveredCameraKey(camera);
    setSelectedDiscovered((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  };

  const handleJoystickMove = (x: number, y: number) => {
    if (selectedId) {
      ws.panTilt(selectedId, x, y, panTiltSpeed);
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
      streamUrl: newCamera.previewType === "none" ? null : newCamera.streamUrl || null,
      previewType: newCamera.previewType,
      previewRefreshMs: newCamera.previewRefreshMs,
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-slate-700 dark:text-slate-400 font-mono">Initializing PTZ Command...</p>
        </div>
      </div>
    );
  }

  const skinProps = {
    cameras,
    presets,
    selectedCameraId: selectedId,
    onSelectCamera: handleSelect,
    onRecallPreset: handleRecallPreset,
    onStorePreset: handleStorePreset,
    onJoystickMove: handleJoystickMove,
    onJoystickStop: handleJoystickStop,
    onZoom: (v: number) => ws?.zoom(selectedId!, v / 50 - 1, 0.5),
    onFocusAuto: () => ws?.focusAuto(selectedId!),
    selectedCamera: selectedCam,
    ws,
  };

  if (skin !== "classic") {
    const SkinComponent = skin === "broadcast" ? BroadcastConsole : skin === "glass" ? StudioGlass : CommandCenter;
    return (
      <Suspense fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }>
        <SkinComponent {...skinProps} />
      </Suspense>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col overflow-hidden">
      <header className="h-14 border-b border-border bg-slate-400/60 dark:bg-slate-950/50 backdrop-blur-md flex items-center justify-between px-6 z-50">
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
            <button className="px-3 py-1.5 rounded text-sm font-medium text-slate-900 dark:text-white bg-slate-400/70 dark:bg-slate-800 border border-slate-400 dark:border-slate-700" data-testid="nav-dashboard">
              Dashboard
            </button>
            <Link href="/scenes">
              <button className="px-3 py-1.5 rounded text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-400/50 dark:hover:bg-slate-800 transition-colors" data-testid="nav-scenes">
                Scenes
              </button>
            </Link>
            <Link href="/macros">
              <button className="px-3 py-1.5 rounded text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-400/50 dark:hover:bg-slate-800 transition-colors" data-testid="nav-macros">
                Macros
              </button>
            </Link>
            <Link href="/runsheet">
              <button className="px-3 py-1.5 rounded text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-400/50 dark:hover:bg-slate-800 transition-colors" data-testid="nav-runsheet">
                Runsheet
              </button>
            </Link>
            <Link href="/switcher">
              <button className="px-3 py-1.5 rounded text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-400/50 dark:hover:bg-slate-800 transition-colors" data-testid="nav-switcher">
                Video Switcher
              </button>
            </Link>
            <Link href="/mixer">
              <button className="px-3 py-1.5 rounded text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-400/50 dark:hover:bg-slate-800 transition-colors" data-testid="nav-mixer">
                Audio Mixer
              </button>
            </Link>
            <Link href="/lighting">
              <button className="px-3 py-1.5 rounded text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-400/50 dark:hover:bg-slate-800 transition-colors" data-testid="nav-lighting">
                Lighting
              </button>
            </Link>
            <Link href="/displays">
              <button className="px-3 py-1.5 rounded text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-400/50 dark:hover:bg-slate-800 transition-colors" data-testid="nav-displays">
                Displays
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
          {undoStatus?.canUndo && (
            <button
              onClick={() => undoMutation.mutate()}
              disabled={undoMutation.isPending}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium bg-amber-100/50 dark:bg-amber-950/30 border border-amber-300/50 dark:border-amber-900/50 text-amber-600 dark:text-amber-500 hover:bg-amber-200/50 dark:hover:bg-amber-900/40 transition-colors"
              title={undoStatus.lastAction?.description || "Undo last action"}
              data-testid="button-undo"
            >
              <Undo2 className="w-3.5 h-3.5" />
              Undo
            </button>
          )}
          <ConnectionHealth />
          <SessionLog />
          <SkinSelector />
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
          <HuePanel />
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
            <h2 className="text-xs font-mono uppercase text-slate-700 dark:text-slate-500 tracking-widest font-bold">Camera Select</h2>
            <div className="flex items-center gap-2">
              <Dialog open={discoverOpen} onOpenChange={setDiscoverOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="text-xs" data-testid="button-discover-cameras">
                    <Search className="w-3 h-3 mr-1" /> Discover Cameras
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Discover VISCA Cameras</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      Scan the local network for VISCA cameras. Leave the subnet blank to scan detected private network ranges.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="discovery-subnet">Subnet</Label>
                        <Input
                          id="discovery-subnet"
                          value={discoverySubnet}
                          onChange={(e) => setDiscoverySubnet(e.target.value)}
                          placeholder="Auto-detect, or 192.168.0.0/24"
                          data-testid="input-discovery-subnet"
                        />
                      </div>
                      <div>
                        <Label htmlFor="discovery-ports">Ports</Label>
                        <Input
                          id="discovery-ports"
                          value={discoveryPorts}
                          onChange={(e) => setDiscoveryPorts(e.target.value)}
                          placeholder="52381, 1259, 5678"
                          data-testid="input-discovery-ports"
                        />
                      </div>
                    </div>

                    <Button
                      onClick={() => discoverCamerasMutation.mutate()}
                      disabled={discoverCamerasMutation.isPending}
                      className="w-full"
                      data-testid="button-run-camera-discovery"
                    >
                      {discoverCamerasMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Scanning Network
                        </>
                      ) : (
                        <>
                          <Search className="w-4 h-4 mr-2" /> Scan Network
                        </>
                      )}
                    </Button>

                    {discoverCamerasMutation.data && (
                      <div className="space-y-3">
                        <div className="text-xs text-slate-500 dark:text-slate-500">
                          Scanned {discoverCamerasMutation.data.subnets.join(", ")} on ports {discoverCamerasMutation.data.ports.join(", ")}.
                        </div>

                        {discoveredCameras.length === 0 ? (
                          <div className="border border-dashed border-slate-300 dark:border-slate-700 rounded-lg p-6 text-center text-sm text-slate-600 dark:text-slate-400">
                            No VISCA cameras found. Try entering the camera subnet manually.
                          </div>
                        ) : (
                          <div className="max-h-72 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-200 dark:divide-slate-800">
                            {discoveredCameras.map((camera) => {
                              const key = discoveredCameraKey(camera);
                              return (
                                <label
                                  key={key}
                                  className={cn(
                                    "flex items-center gap-3 p-3 text-sm",
                                    camera.alreadyConfigured ? "opacity-60" : "cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-900/60"
                                  )}
                                >
                                  <Checkbox
                                    checked={selectedDiscovered.has(key)}
                                    disabled={camera.alreadyConfigured}
                                    onCheckedChange={(checked) => toggleDiscoveredCamera(camera, checked === true)}
                                    data-testid={`checkbox-discovered-camera-${camera.ip}-${camera.port}`}
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="font-medium text-slate-900 dark:text-slate-100">{camera.name}</div>
                                    <div className="font-mono text-xs text-slate-500 dark:text-slate-400">{camera.ip}:{camera.port}</div>
                                  </div>
                                  <Badge variant={camera.confidence === "confirmed" ? "default" : "outline"}>
                                    {camera.confidence === "confirmed" ? "VISCA confirmed" : "Port open"}
                                  </Badge>
                                  {camera.alreadyConfigured && <Badge variant="secondary">Configured</Badge>}
                                </label>
                              );
                            })}
                          </div>
                        )}

                        <Button
                          onClick={() => importDiscoveredMutation.mutate()}
                          disabled={selectedDiscoveredCount === 0 || importDiscoveredMutation.isPending}
                          className="w-full"
                          data-testid="button-import-discovered-cameras"
                        >
                          {importDiscoveredMutation.isPending ? "Adding Cameras..." : `Add Selected${selectedDiscoveredCount ? ` (${selectedDiscoveredCount})` : ""}`}
                        </Button>
                      </div>
                    )}
                  </div>
                </DialogContent>
              </Dialog>

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
                      <Label htmlFor="preview-type">Preview Source</Label>
                      <select
                        id="preview-type"
                        value={newCamera.previewType}
                        onChange={(e) => {
                          const previewType = e.target.value as PreviewType;
                          setNewCamera({ ...newCamera, previewType, streamUrl: previewType === "none" ? "" : newCamera.streamUrl });
                        }}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                        data-testid="select-new-camera-preview-type"
                      >
                        <option value="none">No inline preview</option>
                        <option value="snapshot">HTTP snapshot polling</option>
                        <option value="mjpeg">MJPEG stream</option>
                        <option value="webrtc">WebRTC bridge (WHEP)</option>
                        <option value="browser">Browser USB/UVC input</option>
                      </select>
                      <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                        Add or edit camera settings later to choose local USB inputs.
                      </p>
                    </div>
                    {newCamera.previewType !== "none" && newCamera.previewType !== "browser" && (
                      <div>
                        <Label htmlFor="stream-url">Preview URL</Label>
                        <Input
                          id="stream-url"
                          value={newCamera.streamUrl}
                          onChange={(e) => setNewCamera({ ...newCamera, streamUrl: e.target.value })}
                          placeholder={newCamera.previewType === "webrtc" ? "http://127.0.0.1:8080/camera/whep" : "http://192.168.0.27/cgi-bin/snapshot.cgi"}
                          data-testid="input-new-camera-stream-url"
                        />
                      </div>
                    )}
                    {newCamera.previewType === "snapshot" && (
                      <div>
                        <Label htmlFor="preview-refresh">Snapshot Refresh (ms)</Label>
                        <Input
                          id="preview-refresh"
                          type="number"
                          min={250}
                          value={newCamera.previewRefreshMs}
                          onChange={(e) => setNewCamera({ ...newCamera, previewRefreshMs: parseInt(e.target.value) || 2000 })}
                          data-testid="input-new-camera-preview-refresh"
                        />
                      </div>
                    )}
                    <Button onClick={handleAddCamera} className="w-full" data-testid="button-save-new-camera">
                      Add Camera
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
           
          {cameras.length === 0 ? (
            <div className="border-2 border-dashed border-slate-300 dark:border-slate-800 rounded-xl p-12 text-center">
              <p className="text-slate-700 dark:text-slate-500 mb-4">No cameras configured</p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
                <Button onClick={() => setDiscoverOpen(true)} data-testid="button-find-first-camera">
                  <Search className="w-4 h-4 mr-2" /> Find Cameras
                </Button>
                <Button variant="outline" onClick={() => setAddCameraOpen(true)} data-testid="button-add-first-camera">
                  <Plus className="w-4 h-4 mr-2" /> Add Manually
                </Button>
              </div>
            </div>
          ) : (
            <CameraSelector 
              cameras={cameras.map(c => ({
                id: c.id,
                name: c.name,
                ip: c.ip,
                port: c.port,
                streamUrl: c.streamUrl,
                previewType: c.previewType,
                previewRefreshMs: c.previewRefreshMs,
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
              <div className="glass-panel rounded-2xl p-6 flex-1 flex flex-col items-center justify-center relative overflow-hidden group border-cyan-500/20">
                <div className="absolute inset-0 bg-[url('/src/assets/tech-grid.png')] bg-cover opacity-10 pointer-events-none mix-blend-overlay" />
                
                <div className="absolute top-4 left-4 font-mono text-xs text-cyan-600/70 dark:text-cyan-500/70 border border-cyan-500/30 px-2 py-1 rounded bg-cyan-100/30 dark:bg-cyan-950/30">
                  CONTROLLING: {selectedCam.name.toUpperCase()}
                </div>
                
                <div className="relative z-10 w-full grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_220px] gap-5 items-center mt-6">
                  <CameraMonitor camera={selectedCam} />
                  <div className="flex justify-center">
                    <Joystick
                      className="border-cyan-500/30"
                      onMove={handleJoystickMove}
                      onStop={handleJoystickStop}
                    />
                  </div>
                </div>

                <div className="relative z-10 mt-6 text-center space-y-1">
                   <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white tracking-widest">{selectedCam.name}</div>
                   <div className="text-xs font-mono text-cyan-500">{selectedCam.ip}</div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-3 flex flex-col gap-4">
              <div className="bg-slate-100/30 dark:bg-slate-900/30 border border-slate-300 dark:border-slate-800 rounded-xl p-4 flex-1">
                 <h3 className="text-xs font-mono uppercase text-slate-700 dark:text-slate-500 tracking-widest mb-4 font-bold">Optical Controls</h3>
                 <LensControls 
                   panTiltSpeed={panTiltSpeed}
                   onZoomStart={(direction, speed) => selectedId && ws.zoom(selectedId, direction, speed)}
                   onZoomStop={() => selectedId && ws.zoom(selectedId, 0, 0)}
                   onFocusFarStart={(speed) => selectedId && ws.focusFar(selectedId, speed)}
                   onFocusNearStart={(speed) => selectedId && ws.focusNear(selectedId, speed)}
                   onFocusStop={() => selectedId && ws.focusStop(selectedId)}
                   onFocusAuto={() => selectedId && ws.focusAuto(selectedId)}
                   onPanTiltSpeedChange={setPanTiltSpeed}
                 />
                 
                 <div className="mt-6 grid grid-cols-2 gap-2">
                    <button className="h-12 border border-slate-300 dark:border-slate-700 rounded bg-slate-400/40 dark:bg-slate-800/50 hover:bg-slate-300 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white text-slate-700 dark:text-slate-400 text-xs font-bold transition-colors" data-testid="button-night-mode">
                      NIGHT MODE
                    </button>
                    <button className="h-12 border border-slate-300 dark:border-slate-700 rounded bg-slate-400/40 dark:bg-slate-800/50 hover:bg-slate-300 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white text-slate-700 dark:text-slate-400 text-xs font-bold transition-colors" data-testid="button-osd-menu">
                      OSD MENU
                    </button>
                    <button 
                      onClick={() => ws?.focusAuto(selectedId!)}
                      className="h-12 border border-slate-300 dark:border-slate-700 rounded bg-slate-400/40 dark:bg-slate-800/50 hover:bg-slate-300 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white text-slate-700 dark:text-slate-400 text-xs font-bold transition-colors col-span-2"
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
