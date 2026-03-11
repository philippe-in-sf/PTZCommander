import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { sceneButtonApi, cameraApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Plus, Trash2, Settings, Zap, Play } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { SceneButton, Camera } from "@shared/schema";

interface MixerAction {
  section: string;
  channel: number;
  fader?: number;
  muted?: boolean;
}

const COLORS = [
  "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899",
  "#ef4444", "#f97316", "#eab308", "#22c55e",
];

export function SceneButtons() {
  const queryClient = useQueryClient();
  const [activeSceneId, setActiveSceneId] = useState<number | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editingButton, setEditingButton] = useState<SceneButton | null>(null);
  const [formData, setFormData] = useState({
    buttonNumber: 1,
    name: "",
    color: "#06b6d4",
    atemInputId: null as number | null,
    atemTransitionType: "cut",
    cameraId: null as number | null,
    presetNumber: null as number | null,
    mixerActions: [] as MixerAction[],
  });

  const { data: sceneButtons = [] } = useQuery({
    queryKey: ["sceneButtons"],
    queryFn: sceneButtonApi.getAll,
  });

  const { data: cameras = [] } = useQuery({
    queryKey: ["cameras"],
    queryFn: cameraApi.getAll,
  });

  const createMutation = useMutation({
    mutationFn: sceneButtonApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sceneButtons"] });
      setEditOpen(false);
      toast.success("Scene button created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: Partial<SceneButton> }) =>
      sceneButtonApi.update(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sceneButtons"] });
      setEditOpen(false);
      toast.success("Scene button updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: sceneButtonApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sceneButtons"] });
      toast.success("Scene button deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const executeMutation = useMutation({
    mutationFn: (id: number) => {
      setActiveSceneId(id);
      return sceneButtonApi.execute(id);
    },
    onSuccess: (data) => {
      toast.success("Scene executed", {
        description: data.results.join("\n"),
        duration: 5000,
      });
    },
    onError: (e: Error) => toast.error("Scene failed", { description: e.message, duration: 5000 }),
  });

  const openCreate = () => {
    const nextNum = sceneButtons.length > 0
      ? Math.max(...sceneButtons.map(b => b.buttonNumber)) + 1
      : 1;
    setEditingButton(null);
    setFormData({
      buttonNumber: nextNum,
      name: "",
      color: COLORS[(nextNum - 1) % COLORS.length],
      atemInputId: null,
      atemTransitionType: "cut",
      cameraId: null,
      presetNumber: null,
      mixerActions: [],
    });
    setEditOpen(true);
  };

  const openEdit = (btn: SceneButton) => {
    setEditingButton(btn);
    let mixerActions: MixerAction[] = [];
    try {
      if (btn.mixerActions) mixerActions = JSON.parse(btn.mixerActions);
    } catch {}
    setFormData({
      buttonNumber: btn.buttonNumber,
      name: btn.name,
      color: btn.color,
      atemInputId: btn.atemInputId,
      atemTransitionType: btn.atemTransitionType || "cut",
      cameraId: btn.cameraId,
      presetNumber: btn.presetNumber,
      mixerActions,
    });
    setEditOpen(true);
  };

  const handleSave = () => {
    const payload = {
      buttonNumber: formData.buttonNumber,
      name: formData.name || `Scene ${formData.buttonNumber}`,
      color: formData.color,
      atemInputId: formData.atemInputId,
      atemTransitionType: formData.atemTransitionType,
      cameraId: formData.cameraId,
      presetNumber: formData.presetNumber,
      mixerActions: formData.mixerActions.length > 0
        ? JSON.stringify(formData.mixerActions)
        : null,
    };

    if (editingButton) {
      updateMutation.mutate({ id: editingButton.id, updates: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const addMixerAction = () => {
    setFormData(prev => ({
      ...prev,
      mixerActions: [...prev.mixerActions, { section: "ch", channel: 1, fader: 0.75, muted: false }],
    }));
  };

  const updateMixerAction = (index: number, updates: Partial<MixerAction>) => {
    setFormData(prev => ({
      ...prev,
      mixerActions: prev.mixerActions.map((a, i) => i === index ? { ...a, ...updates } : a),
    }));
  };

  const removeMixerAction = (index: number) => {
    setFormData(prev => ({
      ...prev,
      mixerActions: prev.mixerActions.filter((_, i) => i !== index),
    }));
  };

  return (
    <div className="bg-slate-200/30 dark:bg-slate-900/30 border border-slate-300 dark:border-slate-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-mono uppercase text-slate-400 dark:text-slate-500 tracking-widest flex items-center gap-2">
          <Zap className="w-3 h-3" /> Scene Buttons
        </h3>
        <Button variant="outline" size="sm" className="text-xs h-7" onClick={openCreate} data-testid="button-add-scene">
          <Plus className="w-3 h-3 mr-1" /> Add
        </Button>
      </div>

      {sceneButtons.length === 0 ? (
        <div className="text-center py-6 text-slate-400 dark:text-slate-600 text-sm">
          No scene buttons configured. Create one to trigger combined actions.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {sceneButtons.map((btn) => {
            const isActive = activeSceneId === btn.id;
            return (
            <div key={btn.id} className="relative group">
              <button
                onClick={() => executeMutation.mutate(btn.id)}
                disabled={executeMutation.isPending}
                className={cn(
                  "w-full h-16 rounded-lg font-bold text-sm transition-all",
                  "hover:scale-105 hover:shadow-lg active:scale-95",
                  "border-2 flex flex-col items-center justify-center gap-0.5"
                )}
                style={{
                  backgroundColor: isActive ? btn.color : `${btn.color}20`,
                  borderColor: btn.color,
                  color: isActive ? '#000' : btn.color,
                  boxShadow: isActive ? `0 0 24px ${btn.color}60` : `0 0 12px ${btn.color}30`,
                }}
                data-testid={`button-scene-execute-${btn.id}`}
              >
                <Play className="w-3 h-3" style={{ color: isActive ? '#000' : btn.color }} />
                <span>{btn.name}</span>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); openEdit(btn); }}
                className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-200/80 dark:bg-slate-900/80 rounded p-1"
                data-testid={`button-scene-edit-${btn.id}`}
              >
                <Settings className="w-3 h-3 text-slate-500 dark:text-slate-400" />
              </button>
            </div>
          );
          })}
        </div>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingButton ? "Edit Scene Button" : "Create Scene Button"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Name</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))}
                  placeholder={`Scene ${formData.buttonNumber}`}
                  data-testid="input-scene-name"
                />
              </div>
              <div>
                <Label>Button #</Label>
                <Input
                  type="number"
                  min={1}
                  value={formData.buttonNumber}
                  onChange={(e) => setFormData(p => ({ ...p, buttonNumber: parseInt(e.target.value) || 1 }))}
                  data-testid="input-scene-number"
                />
              </div>
            </div>

            <div>
              <Label>Color</Label>
              <div className="flex gap-2 mt-1">
                {COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setFormData(p => ({ ...p, color: c }))}
                    className={cn(
                      "w-7 h-7 rounded-full border-2 transition-all",
                      formData.color === c ? "border-slate-900 dark:border-white scale-110" : "border-transparent"
                    )}
                    style={{ backgroundColor: c }}
                    data-testid={`button-color-${c}`}
                  />
                ))}
              </div>
            </div>

            <div className="border-t border-slate-200 dark:border-slate-800 pt-3">
              <h4 className="text-xs font-mono uppercase text-slate-500 dark:text-slate-400 mb-2">ATEM Switcher Action</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Input Number</Label>
                  <Input
                    type="number"
                    min={1}
                    value={formData.atemInputId ?? ""}
                    onChange={(e) => setFormData(p => ({ ...p, atemInputId: e.target.value ? parseInt(e.target.value) : null }))}
                    placeholder="None"
                    data-testid="input-scene-atem-input"
                  />
                </div>
                <div>
                  <Label>Transition</Label>
                  <Select
                    value={formData.atemTransitionType}
                    onValueChange={(v) => setFormData(p => ({ ...p, atemTransitionType: v }))}
                  >
                    <SelectTrigger data-testid="select-scene-transition">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cut">Cut</SelectItem>
                      <SelectItem value="auto">Auto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 dark:border-slate-800 pt-3">
              <h4 className="text-xs font-mono uppercase text-slate-500 dark:text-slate-400 mb-2">PTZ Camera Action</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Camera</Label>
                  <Select
                    value={formData.cameraId?.toString() ?? "none"}
                    onValueChange={(v) => setFormData(p => ({ ...p, cameraId: v === "none" ? null : parseInt(v) }))}
                  >
                    <SelectTrigger data-testid="select-scene-camera">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {cameras.map(cam => (
                        <SelectItem key={cam.id} value={cam.id.toString()}>{cam.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Preset #</Label>
                  <Select
                    value={formData.presetNumber?.toString() ?? "none"}
                    onValueChange={(v) => setFormData(p => ({ ...p, presetNumber: v === "none" ? null : parseInt(v) }))}
                  >
                    <SelectTrigger data-testid="select-scene-preset">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {Array.from({ length: 16 }, (_, i) => (
                        <SelectItem key={i} value={i.toString()}>Preset {i + 1}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 dark:border-slate-800 pt-3">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-mono uppercase text-slate-500 dark:text-slate-400">Mixer Channel Actions</h4>
                <Button variant="outline" size="sm" className="text-xs h-6" onClick={addMixerAction} data-testid="button-add-mixer-action">
                  <Plus className="w-3 h-3 mr-1" /> Add Channel
                </Button>
              </div>

              {formData.mixerActions.length === 0 ? (
                <p className="text-xs text-slate-400 dark:text-slate-600">No mixer actions configured.</p>
              ) : (
                <div className="space-y-3">
                  {formData.mixerActions.map((action, idx) => (
                    <div key={idx} className="bg-slate-100/50 dark:bg-slate-800/50 rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">Channel Action {idx + 1}</span>
                        <button onClick={() => removeMixerAction(idx)} className="text-red-500 hover:text-red-400">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <Label className="text-xs">Section</Label>
                          <Select
                            value={action.section}
                            onValueChange={(v) => updateMixerAction(idx, { section: v })}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="ch">Channel</SelectItem>
                              <SelectItem value="bus">Mix Bus</SelectItem>
                              <SelectItem value="auxin">Aux In</SelectItem>
                              <SelectItem value="fxrtn">FX Return</SelectItem>
                              <SelectItem value="mtx">Matrix</SelectItem>
                              <SelectItem value="dca">DCA</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">Ch #</Label>
                          <Input
                            type="number"
                            min={1}
                            max={32}
                            value={action.channel}
                            onChange={(e) => updateMixerAction(idx, { channel: parseInt(e.target.value) || 1 })}
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="flex items-end">
                          <button
                            onClick={() => updateMixerAction(idx, { muted: !action.muted })}
                            className={cn(
                              "h-8 px-3 rounded text-xs font-bold border w-full",
                              action.muted
                                ? "bg-red-50 dark:bg-red-950/50 border-red-300 dark:border-red-700 text-red-500 dark:text-red-400"
                                : "bg-green-50 dark:bg-green-950/50 border-green-300 dark:border-green-700 text-green-600 dark:text-green-400"
                            )}
                          >
                            {action.muted ? "MUTED" : "ON"}
                          </button>
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs">Fader Level: {Math.round((action.fader ?? 0.75) * 100)}%</Label>
                        <Slider
                          value={[action.fader ?? 0.75]}
                          min={0}
                          max={1}
                          step={0.01}
                          onValueChange={([v]) => updateMixerAction(idx, { fader: v })}
                          className="mt-1"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              {editingButton && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => { deleteMutation.mutate(editingButton.id); setEditOpen(false); }}
                  data-testid="button-delete-scene"
                >
                  <Trash2 className="w-3 h-3 mr-1" /> Delete
                </Button>
              )}
              <div className="flex-1" />
              <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} data-testid="button-save-scene">
                {editingButton ? "Update" : "Create"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
