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
  status: 'online' | 'offline' | 'tally';
}

interface CameraSelectorProps {
  cameras: CameraData[];
  previewId: number;
  programId: number;
  onSelectPreview: (id: number) => void;
  onSelectProgram: (id: number) => void;
  onUpdateCamera?: (id: number, updates: { name: string; ip: string; port: number }) => void;
  onDeleteCamera?: (id: number) => void;
}

export function CameraSelector({ 
  cameras, 
  previewId, 
  programId, 
  onSelectPreview, 
  onSelectProgram,
  onUpdateCamera,
  onDeleteCamera 
}: CameraSelectorProps) {
  const [editingCamera, setEditingCamera] = useState<CameraData | null>(null);
  const [editForm, setEditForm] = useState({ name: '', ip: '', port: 52381 });
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleEditClick = (e: React.MouseEvent, cam: CameraData) => {
    e.stopPropagation();
    setEditingCamera(cam);
    setEditForm({ 
      name: cam.name, 
      ip: cam.ip, 
      port: cam.port || 52381 
    });
    setConfirmDelete(false);
  };

  const handleSave = () => {
    if (editingCamera && onUpdateCamera) {
      onUpdateCamera(editingCamera.id, editForm);
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
          const isPreview = previewId === cam.id;
          const isProgram = programId === cam.id;
          const isOnline = cam.status !== 'offline';
          const isTally = cam.status === 'tally' || isProgram;

          return (
            <div
              key={cam.id}
              data-testid={`camera-card-${cam.id}`}
              onClick={() => onSelectPreview(cam.id)}
              className={cn(
                "relative flex flex-col items-start p-4 h-32 rounded-lg border transition-all duration-200 group overflow-hidden cursor-pointer",
                isProgram 
                  ? "bg-red-950/20 border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.25)]" 
                  : isPreview
                    ? "bg-emerald-950/20 border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.25)]"
                    : "bg-slate-900/50 border-slate-800 hover:border-slate-700 hover:bg-slate-800/50"
              )}
            >
              {/* Settings Button */}
              <button
                onClick={(e) => handleEditClick(e, cam)}
                className="absolute top-3 left-3 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white"
                data-testid={`camera-settings-${cam.id}`}
              >
                <Settings className="w-3.5 h-3.5" />
              </button>

              {/* Status Indicator */}
              <div className="absolute top-3 right-3 flex items-center gap-2">
                <span className={cn(
                  "text-[10px] font-mono uppercase tracking-wider",
                  isTally ? "text-red-500 font-bold" : isPreview ? "text-emerald-500 font-bold" : "text-slate-500"
                )}>
                  {isTally ? "PGM" : isPreview ? "PVW" : cam.status}
                </span>
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  isTally ? "bg-red-500 animate-pulse shadow-[0_0_8px_red]" : 
                  isPreview ? "bg-emerald-500 shadow-[0_0_8px_emerald]" :
                  isOnline ? "bg-slate-600" : "bg-red-900"
                )} />
              </div>

              {/* Icon */}
              <div className={cn(
                "mb-auto p-2 rounded-md transition-colors",
                isProgram ? "bg-red-500/10 text-red-400" :
                isPreview ? "bg-emerald-500/10 text-emerald-400" : 
                "bg-slate-800 text-slate-500"
              )}>
                {isOnline ? <Camera className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
              </div>

              {/* Info */}
              <div className="text-left z-10 w-full">
                <div className="flex justify-between items-end">
                  <div>
                    <div className="font-mono text-xs text-slate-500 mb-0.5">{cam.ip}:{cam.port || 52381}</div>
                    <div className={cn(
                      "font-bold text-lg leading-none tracking-tight",
                      isProgram ? "text-red-100" :
                      isPreview ? "text-emerald-100" :
                      "text-slate-300"
                    )}>
                      {cam.name}
                    </div>
                  </div>
                  
                  {/* Manual Cut Button */}
                  {!isProgram && (
                     <button 
                       onClick={(e) => {
                         e.stopPropagation();
                         onSelectProgram(cam.id);
                       }}
                       className="opacity-0 group-hover:opacity-100 transition-opacity bg-red-500/20 hover:bg-red-500 text-red-200 hover:text-white text-[10px] font-bold px-2 py-1 rounded border border-red-500/50 uppercase"
                       data-testid={`camera-cut-${cam.id}`}
                     >
                       CUT
                     </button>
                  )}
                </div>
              </div>

              {/* Selection Corner */}
              {(isPreview || isProgram) && (
                <div className={cn(
                  "absolute bottom-0 right-0 w-4 h-4 [clip-path:polygon(100%_0,0_100%,100%_100%)]",
                  isProgram ? "bg-red-500" : "bg-emerald-500"
                )} />
              )}
              
              {/* Background Tech Pattern */}
              <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white to-transparent" />
            </div>
          );
        })}
      </div>

      {/* Edit Camera Dialog */}
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
