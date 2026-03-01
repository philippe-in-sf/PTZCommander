import { cn } from "@/lib/utils";
import { Camera, WifiOff, Settings, Trash2 } from "lucide-react";
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
  atemInputId?: number | null;
  tallyState?: string;
  status: 'online' | 'offline' | 'tally';
}

interface CameraSelectorProps {
  cameras: CameraData[];
  selectedId: number;
  onSelect: (id: number) => void;
  onUpdateCamera?: (id: number, updates: { name: string; ip: string; port: number; streamUrl?: string | null; atemInputId?: number | null }) => void;
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
  const [editForm, setEditForm] = useState({ name: '', ip: '', port: 52381, streamUrl: '', atemInputId: '' });
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleEditClick = (e: React.MouseEvent, cam: CameraData) => {
    e.stopPropagation();
    setEditingCamera(cam);
    setEditForm({ 
      name: cam.name, 
      ip: cam.ip, 
      port: cam.port || 52381,
      streamUrl: cam.streamUrl || '',
      atemInputId: cam.atemInputId ? String(cam.atemInputId) : '',
    });
    setConfirmDelete(false);
  };

  const handleSave = () => {
    if (editingCamera && onUpdateCamera) {
      onUpdateCamera(editingCamera.id, {
        name: editForm.name,
        ip: editForm.ip,
        port: editForm.port,
        streamUrl: editForm.streamUrl || null,
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
                  ? "bg-red-950/20 border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.25)]"
                  : cam.tallyState === "preview"
                  ? "bg-green-950/20 border-green-500 shadow-[0_0_20px_rgba(34,197,94,0.25)]"
                  : isSelected
                  ? "bg-cyan-950/20 border-cyan-500 shadow-[0_0_20px_rgba(6,182,212,0.25)]"
                  : "bg-slate-900/50 border-slate-800 hover:border-slate-700 hover:bg-slate-800/50"
              )}
            >
              <button
                onClick={(e) => handleEditClick(e, cam)}
                className="absolute top-3 left-3 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white"
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
                  isSelected ? "text-cyan-500 font-bold" : "text-slate-500"
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
                "bg-slate-800 text-slate-500"
              )}>
                {isOnline ? <Camera className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
              </div>

              <div className="text-left z-10 w-full">
                <div className="font-mono text-xs text-slate-500 mb-0.5">{cam.ip}:{cam.port || 52381}</div>
                <div className={cn(
                  "font-bold text-lg leading-none tracking-tight",
                  isSelected ? "text-cyan-100" : "text-slate-300"
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
                <Label htmlFor="edit-stream">Snapshot/Stream URL</Label>
                <Input
                  id="edit-stream"
                  value={editForm.streamUrl}
                  onChange={(e) => setEditForm({ ...editForm, streamUrl: e.target.value })}
                  placeholder="http://192.168.0.27/cgi-bin/snapshot.cgi"
                  data-testid="input-camera-stream-url"
                />
                <p className="text-xs text-slate-500 mt-1">
                  HTTP URL for camera snapshot (JPEG). Used for live preview on dashboard.
                </p>
              </div>
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
              <p className="text-center text-slate-300">
                Are you sure you want to delete <strong>{editingCamera?.name}</strong>?
              </p>
              <p className="text-center text-sm text-slate-500">
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
