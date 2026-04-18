import { cn } from "@/lib/utils";
import { Camera, MonitorUp, Settings, Trash2, WifiOff } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface CameraData {
  id: number;
  name: string;
  ip: string;
  port?: number;
  streamUrl?: string | null;
  previewType?: "none" | "snapshot" | "mjpeg" | "webrtc" | "browser" | string;
  previewRefreshMs?: number | null;
  atemInputId?: number | null;
  tallyState?: string;
  status: 'online' | 'offline' | 'tally';
}

interface CameraSelectorProps {
  cameras: CameraData[];
  selectedId: number;
  onSelect: (id: number) => void;
  onUpdateCamera?: (id: number, updates: {
    name: string;
    ip: string;
    port: number;
    streamUrl?: string | null;
    previewType?: string;
    previewRefreshMs?: number;
    atemInputId?: number | null;
  }) => void;
  onDeleteCamera?: (id: number) => void;
}

export function CameraSelector({ 
  cameras, 
  selectedId, 
  onSelect,
  onUpdateCamera,
  onDeleteCamera 
}: CameraSelectorProps) {
  const [editingCamera, setEditingCamera] = useState<CameraData | null>(null);
  const [editForm, setEditForm] = useState({ name: '', ip: '', port: 52381, streamUrl: '', previewType: 'none', previewRefreshMs: 2000, atemInputId: '' });
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDeviceError, setVideoDeviceError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleEditClick = (e: React.MouseEvent, cam: CameraData) => {
    e.stopPropagation();
    setEditingCamera(cam);
    setEditForm({ 
      name: cam.name, 
      ip: cam.ip, 
      port: cam.port || 52381,
      streamUrl: cam.streamUrl || '',
      previewType: cam.previewType || (cam.streamUrl ? 'snapshot' : 'none'),
      previewRefreshMs: cam.previewRefreshMs || 2000,
      atemInputId: cam.atemInputId ? String(cam.atemInputId) : '',
    });
    setVideoDeviceError("");
    setConfirmDelete(false);
  };

  const handleSave = () => {
    if (editingCamera && onUpdateCamera) {
      onUpdateCamera(editingCamera.id, {
        name: editForm.name,
        ip: editForm.ip,
        port: editForm.port,
        streamUrl: editForm.previewType === 'none' ? null : editForm.streamUrl || null,
        previewType: editForm.previewType,
        previewRefreshMs: Math.max(250, editForm.previewRefreshMs || 2000),
        atemInputId: editForm.atemInputId ? parseInt(editForm.atemInputId) : null,
      });
    }
    setEditingCamera(null);
  };

  const handleDelete = () => {
    if (editingCamera && onDeleteCamera) {
      onDeleteCamera(editingCamera.id);
    }
    setEditingCamera(null);
    setConfirmDelete(false);
  };

  const loadVideoInputs = async () => {
    setVideoDeviceError("");
    try {
      if (!navigator.mediaDevices?.enumerateDevices || !navigator.mediaDevices?.getUserMedia) {
        throw new Error("Browser video devices are not available");
      }
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      stream.getTracks().forEach((track) => track.stop());
      const devices = await navigator.mediaDevices.enumerateDevices();
      setVideoDevices(devices.filter((device) => device.kind === "videoinput"));
    } catch (error: any) {
      setVideoDeviceError(error.message || "Could not list browser video inputs");
    }
  };

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full">
        {cameras.map((cam) => {
          const isSelected = selectedId === cam.id;
          const isOnline = cam.status !== 'offline';

          return (
            <div
              key={cam.id}
              data-testid={`camera-card-${cam.id}`}
              onClick={() => onSelect(cam.id)}
              className={cn(
                "relative flex flex-col items-start p-4 h-32 rounded-lg border transition-all duration-200 group overflow-hidden cursor-pointer",
                cam.tallyState === "program"
                  ? "bg-red-50/50 dark:bg-red-950/20 border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.25)]"
                  : cam.tallyState === "preview"
                  ? "bg-green-50/50 dark:bg-green-950/20 border-green-500 shadow-[0_0_20px_rgba(34,197,94,0.25)]"
                  : isSelected
                  ? "bg-cyan-50/50 dark:bg-cyan-950/20 border-cyan-500 shadow-[0_0_20px_rgba(6,182,212,0.25)]"
                  : "bg-slate-400/40 dark:bg-slate-900/50 border-slate-300 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-700 hover:bg-slate-100/50 dark:hover:bg-slate-800/50"
              )}
            >
              <button
                onClick={(e) => handleEditClick(e, cam)}
                className="absolute top-3 left-3 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded bg-slate-200/80 dark:bg-slate-800/80 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                data-testid={`camera-settings-${cam.id}`}
              >
                <Settings className="w-3.5 h-3.5" />
              </button>

              <div className="absolute top-3 right-3 flex items-center gap-2">
                {cam.tallyState === "program" && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-600 text-white animate-pulse" data-testid={`tally-pgm-${cam.id}`}>PGM</span>
                )}
                {cam.tallyState === "preview" && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-green-600 text-white" data-testid={`tally-pvw-${cam.id}`}>PVW</span>
                )}
                <span className={cn(
                  "text-[10px] font-mono uppercase tracking-wider",
                  isSelected ? "text-cyan-500 font-bold" : "text-slate-600 dark:text-slate-500"
                )}>
                  {isSelected ? "SELECTED" : cam.status}
                </span>
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  cam.tallyState === "program" ? "bg-red-500 shadow-[0_0_8px_red]" :
                  cam.tallyState === "preview" ? "bg-green-500 shadow-[0_0_8px_green]" :
                  isSelected ? "bg-cyan-500 shadow-[0_0_8px_cyan]" :
                  isOnline ? "bg-slate-600" : "bg-red-900"
                )} />
              </div>

              <div className={cn(
                "mb-auto p-2 rounded-md transition-colors",
                isSelected ? "bg-cyan-500/10 text-cyan-400" : 
                "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-500"
              )}>
                {isOnline ? <Camera className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
              </div>

              <div className="text-left z-10 w-full">
                <div className="font-mono text-xs text-slate-600 dark:text-slate-500 mb-0.5">{cam.ip}:{cam.port || 52381}</div>
                <div className={cn(
                  "font-bold text-lg leading-none tracking-tight",
                  isSelected ? "text-cyan-900 dark:text-cyan-100" : "text-slate-700 dark:text-slate-300"
                )}>
                  {cam.name}
                </div>
              </div>

              {isSelected && (
                <div className={cn(
                  "absolute bottom-0 right-0 w-4 h-4 [clip-path:polygon(100%_0,0_100%,100%_100%)]",
                  "bg-cyan-500"
                )} />
              )}
              
              <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white to-transparent" />
            </div>
          );
        })}
      </div>

      <Dialog open={!!editingCamera} onOpenChange={(open) => !open && setEditingCamera(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Camera Settings</DialogTitle>
          </DialogHeader>
          
          {!confirmDelete ? (
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-name">Camera Name</Label>
                <Input
                  id="edit-name"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  data-testid="input-camera-name"
                />
              </div>
              <div>
                <Label htmlFor="edit-ip">IP Address</Label>
                <Input
                  id="edit-ip"
                  value={editForm.ip}
                  onChange={(e) => setEditForm({ ...editForm, ip: e.target.value })}
                  data-testid="input-camera-ip"
                />
              </div>
              <div>
                <Label htmlFor="edit-port">VISCA Port</Label>
                <Input
                  id="edit-port"
                  type="number"
                  value={editForm.port}
                  onChange={(e) => setEditForm({ ...editForm, port: parseInt(e.target.value) || 52381 })}
                  data-testid="input-camera-port"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Common ports: 5678 (Fomako), 52381 (Sony/standard), 1259
                </p>
              </div>
              <div>
                <Label htmlFor="edit-preview-type">Preview Source</Label>
                <select
                  id="edit-preview-type"
                  value={editForm.previewType}
                  onChange={(e) => setEditForm({ ...editForm, previewType: e.target.value, streamUrl: e.target.value === 'none' ? '' : editForm.streamUrl })}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                  data-testid="select-camera-preview-type"
                >
                  <option value="none">No inline preview</option>
                  <option value="snapshot">HTTP snapshot polling</option>
                  <option value="mjpeg">MJPEG stream</option>
                  <option value="webrtc">WebRTC bridge (WHEP)</option>
                  <option value="browser">Browser USB/UVC input</option>
                </select>
                <p className="text-xs text-slate-500 mt-1">
                  PTZOptics, Fomako, and Marshall cameras commonly expose snapshot or MJPEG URLs. ATEM USB output appears as a browser video input.
                </p>
              </div>
              {editForm.previewType !== 'none' && editForm.previewType !== 'browser' && (
                <div>
                  <Label htmlFor="edit-stream">Preview URL</Label>
                  <Input
                    id="edit-stream"
                    value={editForm.streamUrl}
                    onChange={(e) => setEditForm({ ...editForm, streamUrl: e.target.value })}
                    placeholder={editForm.previewType === 'webrtc' ? "http://127.0.0.1:8080/camera/whep" : "http://192.168.0.27/cgi-bin/snapshot.cgi"}
                    data-testid="input-camera-stream-url"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Snapshot and MJPEG are proxied by the app. WebRTC expects a WHEP-compatible bridge endpoint.
                  </p>
                </div>
              )}
              {editForm.previewType === 'browser' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="edit-browser-video">Local Video Input</Label>
                    <Button type="button" size="sm" variant="outline" onClick={loadVideoInputs} data-testid="button-load-video-inputs">
                      <MonitorUp className="w-3 h-3 mr-1" /> Detect Inputs
                    </Button>
                  </div>
                  <select
                    id="edit-browser-video"
                    value={editForm.streamUrl}
                    onChange={(e) => setEditForm({ ...editForm, streamUrl: e.target.value })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                    data-testid="select-camera-browser-video"
                  >
                    <option value="">Default browser camera</option>
                    {videoDevices.map((device, index) => (
                      <option key={device.deviceId} value={device.deviceId}>{device.label || `Video input ${index + 1}`}</option>
                    ))}
                  </select>
                  {videoDeviceError && <p className="text-xs text-red-500">{videoDeviceError}</p>}
                </div>
              )}
              {editForm.previewType === 'snapshot' && (
                <div>
                  <Label htmlFor="edit-preview-refresh">Snapshot Refresh (ms)</Label>
                  <Input
                    id="edit-preview-refresh"
                    type="number"
                    min={250}
                    value={editForm.previewRefreshMs}
                    onChange={(e) => setEditForm({ ...editForm, previewRefreshMs: parseInt(e.target.value) || 2000 })}
                    data-testid="input-camera-preview-refresh"
                  />
                </div>
              )}
              <div>
                <Label htmlFor="edit-atem-input">ATEM Input Number</Label>
                <Input
                  id="edit-atem-input"
                  type="number"
                  value={editForm.atemInputId}
                  onChange={(e) => setEditForm({ ...editForm, atemInputId: e.target.value })}
                  placeholder="e.g. 1, 2, 3, 4"
                  data-testid="input-camera-atem-input"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Maps this camera to an ATEM switcher input for automatic tally lights.
                </p>
              </div>
              
              <div className="flex gap-2">
                <Button onClick={handleSave} className="flex-1" data-testid="button-save-camera">
                  Save Changes
                </Button>
                <Button 
                  variant="destructive" 
                  onClick={() => setConfirmDelete(true)}
                  data-testid="button-delete-camera"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-center text-slate-700 dark:text-slate-300">
                Are you sure you want to delete <strong>{editingCamera?.name}</strong>?
              </p>
              <p className="text-center text-sm text-slate-700 dark:text-slate-500">
                This will also delete all saved presets for this camera.
              </p>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => setConfirmDelete(false)} 
                  className="flex-1"
                  data-testid="button-cancel-delete"
                >
                  Cancel
                </Button>
                <Button 
                  variant="destructive" 
                  onClick={handleDelete} 
                  className="flex-1"
                  data-testid="button-confirm-delete"
                >
                  Delete Camera
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
