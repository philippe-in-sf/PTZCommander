import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { layoutApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FolderOpen, Save, Trash2, Upload, RefreshCw, Plus, Layout } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Layout as LayoutType } from "@shared/schema";

const COLORS = [
  "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899",
  "#ef4444", "#f97316", "#eab308", "#22c55e",
];

export function LayoutSelector() {
  const queryClient = useQueryClient();
  const [manageOpen, setManageOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveDescription, setSaveDescription] = useState("");
  const [saveColor, setSaveColor] = useState("#06b6d4");

  const { data: allLayouts = [] } = useQuery({
    queryKey: ["layouts"],
    queryFn: layoutApi.getAll,
  });

  const { data: activeLayout } = useQuery({
    queryKey: ["layouts", "active"],
    queryFn: layoutApi.getActive,
  });

  const saveMutation = useMutation({
    mutationFn: layoutApi.saveCurrent,
    onSuccess: (layout) => {
      queryClient.invalidateQueries({ queryKey: ["layouts"] });
      setSaveOpen(false);
      setSaveName("");
      setSaveDescription("");
      toast.success(`Layout "${layout.name}" saved`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const loadMutation = useMutation({
    mutationFn: layoutApi.load,
    onSuccess: (data) => {
      queryClient.invalidateQueries();
      setManageOpen(false);
      toast.success(data.message, { duration: 3000 });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateSnapshotMutation = useMutation({
    mutationFn: layoutApi.updateSnapshot,
    onSuccess: (layout) => {
      queryClient.invalidateQueries({ queryKey: ["layouts"] });
      toast.success(`Layout "${layout.name}" updated with current config`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: layoutApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["layouts"] });
      toast.success("Layout deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleSave = () => {
    if (!saveName.trim()) return;
    saveMutation.mutate({ name: saveName.trim(), description: saveDescription.trim() || undefined, color: saveColor });
  };

  const getSnapshotSummary = (layout: LayoutType) => {
    try {
      const snap = JSON.parse(layout.snapshot);
      const parts: string[] = [];
      if (snap.cameras?.length) parts.push(`${snap.cameras.length} cam`);
      if (snap.sceneButtons?.length) parts.push(`${snap.sceneButtons.length} scene`);
      if (snap.mixers?.length) parts.push(`${snap.mixers.length} mixer`);
      if (snap.switchers?.length) parts.push(`${snap.switchers.length} switcher`);
      return parts.join(", ") || "Empty";
    } catch {
      return "Unknown";
    }
  };

  return (
    <>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => setManageOpen(true)}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors",
            "bg-slate-100/60 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
          )}
          data-testid="button-layouts"
        >
          <Layout className="w-3.5 h-3.5" />
          {activeLayout ? (
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: activeLayout.color }} />
              {activeLayout.name}
            </span>
          ) : (
            "Layouts"
          )}
        </button>
      </div>

      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-cyan-500" /> Production Layouts
            </DialogTitle>
          </DialogHeader>

          <p className="text-xs text-slate-400 dark:text-slate-500 -mt-2">
            Save and load complete production setups — cameras, scene buttons, mixer, and switcher configurations.
          </p>

          <div className="space-y-2">
            {allLayouts.length === 0 ? (
              <div className="text-center py-8 text-slate-400 dark:text-slate-600 text-sm">
                No layouts saved yet. Save your current setup to get started.
              </div>
            ) : (
              allLayouts.map((layout) => {
                const isActive = activeLayout?.id === layout.id;
                return (
                  <div
                    key={layout.id}
                    className={cn(
                      "rounded-lg border p-3 transition-all",
                      isActive
                        ? "border-cyan-500 dark:border-cyan-600 bg-cyan-50/50 dark:bg-cyan-950/20"
                        : "border-slate-300 dark:border-slate-800 bg-slate-200/50 dark:bg-slate-900/50 hover:border-slate-400 dark:hover:border-slate-700"
                    )}
                    data-testid={`layout-item-${layout.id}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: layout.color }} />
                        <div className="min-w-0">
                          <div className="font-medium text-sm flex items-center gap-1.5">
                            {layout.name}
                            {isActive && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-100 dark:bg-cyan-900/50 text-cyan-600 dark:text-cyan-400 border border-cyan-300 dark:border-cyan-800">
                                ACTIVE
                              </span>
                            )}
                          </div>
                          {layout.description && (
                            <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{layout.description}</p>
                          )}
                          <p className="text-[10px] text-slate-400 dark:text-slate-600 mt-0.5">{getSnapshotSummary(layout)}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        {!isActive && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={() => loadMutation.mutate(layout.id)}
                            disabled={loadMutation.isPending}
                            data-testid={`button-load-layout-${layout.id}`}
                          >
                            <Upload className="w-3 h-3" /> Load
                          </Button>
                        )}
                        {isActive && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={() => updateSnapshotMutation.mutate(layout.id)}
                            disabled={updateSnapshotMutation.isPending}
                            data-testid={`button-update-layout-${layout.id}`}
                          >
                            <RefreshCw className="w-3 h-3" /> Update
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-red-500 hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                          onClick={() => deleteMutation.mutate(layout.id)}
                          data-testid={`button-delete-layout-${layout.id}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <Button
            className="w-full gap-2"
            onClick={() => { setSaveOpen(true); setManageOpen(false); }}
            data-testid="button-save-layout"
          >
            <Save className="w-4 h-4" /> Save Current Setup as Layout
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Save className="w-5 h-5 text-cyan-500" /> Save Layout
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label>Layout Name</Label>
              <Input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="e.g. Sunday Service"
                autoFocus
                data-testid="input-layout-name"
              />
            </div>
            <div>
              <Label>Description (optional)</Label>
              <Input
                value={saveDescription}
                onChange={(e) => setSaveDescription(e.target.value)}
                placeholder="e.g. 3-camera setup with worship scenes"
                data-testid="input-layout-description"
              />
            </div>
            <div>
              <Label>Color</Label>
              <div className="flex gap-2 mt-1">
                {COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setSaveColor(c)}
                    className={cn(
                      "w-7 h-7 rounded-full border-2 transition-all",
                      saveColor === c ? "border-slate-900 dark:border-white scale-110" : "border-transparent"
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setSaveOpen(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleSave}
                disabled={!saveName.trim() || saveMutation.isPending}
                data-testid="button-confirm-save-layout"
              >
                {saveMutation.isPending ? "Saving..." : "Save Layout"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
