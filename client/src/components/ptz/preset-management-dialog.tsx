import { useEffect, useState } from "react";
import { Camera, Play, RefreshCw, Save, Trash2 } from "lucide-react";
import type { Preset } from "@shared/schema";
import { normalizePresetName } from "@shared/preset-management";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface PresetManagementDialogProps {
  preset: Preset | null;
  cameraName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaveName: (preset: Preset, name: string | null) => void;
  onRefreshThumbnail: (preset: Preset) => void;
  onDelete: (preset: Preset) => void;
  onRecall: (preset: Preset) => void;
  saving?: boolean;
  refreshing?: boolean;
  deleting?: boolean;
  recalling?: boolean;
}

function formatPresetDate(value: Preset["updatedAt"]) {
  if (!value) return "Never";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString();
}

export function PresetManagementDialog({
  preset,
  cameraName,
  open,
  onOpenChange,
  onSaveName,
  onRefreshThumbnail,
  onDelete,
  onRecall,
  saving = false,
  refreshing = false,
  deleting = false,
  recalling = false,
}: PresetManagementDialogProps) {
  const [name, setName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setName(preset?.name || "");
    setConfirmDelete(false);
  }, [preset?.id, preset?.name, open]);

  if (!preset) return null;

  const normalizedName = normalizePresetName(name);
  const unchanged = normalizedName === (preset.name || null);
  const busy = saving || refreshing || deleting || recalling;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-slate-200 dark:bg-slate-950 border-slate-300 dark:border-slate-800">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-4 w-4 text-cyan-500" />
            Preset {preset.presetNumber + 1}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="overflow-hidden rounded-lg border border-slate-300 dark:border-slate-800 bg-slate-950 aspect-video">
            {preset.thumbnail ? (
              <img src={preset.thumbnail} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-xs font-mono uppercase tracking-[0.18em] text-slate-500">
                No Thumbnail
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-600 dark:text-slate-400">
            <div>
              <div className="font-mono uppercase tracking-[0.16em] text-slate-500">Camera</div>
              <div className="mt-1 text-slate-900 dark:text-slate-100">{cameraName || `Camera ${preset.cameraId}`}</div>
            </div>
            <div>
              <div className="font-mono uppercase tracking-[0.16em] text-slate-500">Updated</div>
              <div className="mt-1 text-slate-900 dark:text-slate-100">{formatPresetDate(preset.updatedAt)}</div>
            </div>
          </div>

          <div>
            <Label htmlFor="preset-name">Preset Name</Label>
            <Input
              id="preset-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={`Preset ${preset.presetNumber + 1}`}
              data-testid="input-preset-name"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onRecall(preset)}
              disabled={busy}
              data-testid="button-dialog-recall-preset"
            >
              <Play className="h-4 w-4" /> Recall
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => onRefreshThumbnail(preset)}
              disabled={busy}
              data-testid="button-refresh-preset-thumbnail"
            >
              <RefreshCw className="h-4 w-4" /> Refresh Thumbnail
            </Button>
          </div>

          {confirmDelete ? (
            <div className="rounded-lg border border-red-400/50 bg-red-500/10 p-3 space-y-3">
              <div className="text-sm font-medium text-red-700 dark:text-red-300">Delete this preset slot?</div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button type="button" variant="outline" onClick={() => setConfirmDelete(false)} disabled={busy}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => onDelete(preset)}
                  disabled={busy}
                  data-testid="button-confirm-delete-preset"
                >
                  <Trash2 className="h-4 w-4" /> Delete Preset
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              variant="destructive"
              onClick={() => setConfirmDelete(true)}
              disabled={busy}
              data-testid="button-delete-preset"
            >
              <Trash2 className="h-4 w-4" /> Delete Preset
            </Button>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Close
          </Button>
          <Button
            type="button"
            onClick={() => onSaveName(preset, normalizedName)}
            disabled={busy || unchanged}
            data-testid="button-save-preset-name"
          >
            <Save className="h-4 w-4" /> Save Name
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
