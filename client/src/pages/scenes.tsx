import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { sceneButtonApi, cameraApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Plus, Trash2, Settings, Zap, Play, Lightbulb, Lock, Unlock, ListChecks, FlaskConical, Folder } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AppLayout } from "@/components/app-layout";
import type { SceneButton, Camera } from "@shared/schema";

interface MixerAction {
  section: string;
  channel: number;
  fader?: number;
  muted?: boolean;
}

interface HueSceneAction {
  type: "scene";
  bridgeId: number;
  sceneId: string;
  groupId?: string;
}

type SceneTestSection = "atem" | "mixer" | "hue" | "ptz";

const COLORS = [
  "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899",
  "#ef4444", "#f97316", "#eab308", "#22c55e",
];

type SceneFormData = {
  buttonNumber: number;
  name: string;
  groupName: string;
  color: string;
  atemInputId: number | null;
  atemTransitionType: string;
  cameraId: number | null;
  presetNumber: number | null;
  mixerActions: MixerAction[];
  hueActions: HueSceneAction[];
};

function getSceneGroupName(button: Pick<SceneButton, "groupName">) {
  return button.groupName?.trim() || "General";
}

function getFormPreview(formData: SceneFormData, cameras: Camera[]) {
  const preview: string[] = [];
  if (formData.hueActions.length > 0) {
    const readyActions = formData.hueActions.filter((action) => action.bridgeId && action.sceneId).length;
    preview.push(`Hue: ${readyActions}/${formData.hueActions.length} scene action(s) ready`);
  }
  if (formData.atemInputId !== null) {
    preview.push(`ATEM: ${formData.atemTransitionType === "auto" ? "auto transition" : "cut"} to input ${formData.atemInputId}`);
  }
  if (formData.cameraId !== null && formData.presetNumber !== null) {
    const cameraName = cameras.find((camera) => camera.id === formData.cameraId)?.name || `Camera ${formData.cameraId}`;
    preview.push(`PTZ: ${cameraName} recalls preset ${formData.presetNumber + 1}`);
  }
  if (formData.mixerActions.length > 0) {
    preview.push(`Mixer: ${formData.mixerActions.length} channel action(s)`);
  }
  return preview.length > 0 ? preview : ["No hardware actions configured yet"];
}

function hasSceneSection(formData: SceneFormData, section: SceneTestSection) {
  if (section === "hue") return formData.hueActions.some((action) => action.bridgeId && action.sceneId);
  if (section === "atem") return formData.atemInputId !== null;
  if (section === "ptz") return formData.cameraId !== null && formData.presetNumber !== null;
  return formData.mixerActions.length > 0;
}

function HueActionRow({ action, bridges, onUpdate, onRemove }: {
  action: HueSceneAction;
  bridges: { id: number; name: string; status?: string }[];
  onUpdate: (u: Partial<HueSceneAction>) => void;
  onRemove: () => void;
}) {
  const { data: scenes = [] } = useQuery<{ id: string; name: string; group?: string }[]>({
    queryKey: [`/api/hue/bridges/${action.bridgeId}/scenes`],
    enabled: !!action.bridgeId,
  });
  const { data: groups = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: [`/api/hue/bridges/${action.bridgeId}/groups`],
    enabled: !!action.bridgeId,
  });
  const selectedBridge = bridges.find((bridge) => bridge.id === action.bridgeId);
  const groupNames = new Map(groups.map((group) => [group.id, group.name]));
  const sortedScenes = [...scenes].sort((a, b) => {
    const groupA = groupNames.get(a.group || "") || "Ungrouped";
    const groupB = groupNames.get(b.group || "") || "Ungrouped";
    return `${groupA} ${a.name}`.localeCompare(`${groupB} ${b.name}`);
  });

  return (
    <div className="bg-slate-300 dark:bg-slate-800/50 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-yellow-600 dark:text-yellow-400 font-mono flex items-center gap-1">
          <Lightbulb className="w-3 h-3" />Activate Scene
        </span>
        <button onClick={onRemove} className="text-red-500 hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <Label className="text-xs">Bridge</Label>
          <Select value={action.bridgeId?.toString() || ""} onValueChange={(v) => onUpdate({ bridgeId: parseInt(v), sceneId: "", groupId: undefined })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
            <SelectContent>{bridges.map(b => <SelectItem key={b.id} value={b.id.toString()}>{b.name}</SelectItem>)}</SelectContent>
          </Select>
          {selectedBridge && (
            <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">Status: {selectedBridge.status || "unknown"}</p>
          )}
        </div>
        <div>
          <Label className="text-xs">Scene</Label>
          <Select value={action.sceneId || ""} onValueChange={(v) => {
            const scene = scenes.find((candidate) => candidate.id === v);
            onUpdate({ sceneId: v, groupId: scene?.group || action.groupId });
          }} disabled={!action.bridgeId}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
            <SelectContent>
              {sortedScenes.map(s => {
                const groupName = groupNames.get(s.group || "") || "Ungrouped";
                return <SelectItem key={s.id} value={s.id}>{groupName} / {s.name}</SelectItem>;
              })}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Room (optional)</Label>
          <Select value={action.groupId || "_all"} onValueChange={(v) => onUpdate({ groupId: v === "_all" ? undefined : v })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">All lights</SelectItem>
              {groups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

export default function ScenesPage() {
  const queryClient = useQueryClient();
  const [activeSceneId, setActiveSceneId] = useState<number | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editingButton, setEditingButton] = useState<SceneButton | null>(null);
  const [operatorLocked, setOperatorLocked] = useState(() => localStorage.getItem("ptzcommand:operator-lock") === "locked");
  const [formData, setFormData] = useState<SceneFormData>({
    buttonNumber: 1,
    name: "",
    groupName: "General",
    color: "#06b6d4",
    atemInputId: null as number | null,
    atemTransitionType: "cut",
    cameraId: null as number | null,
    presetNumber: null as number | null,
    mixerActions: [] as MixerAction[],
    hueActions: [] as HueSceneAction[],
  });

  const { data: sceneButtons = [] } = useQuery({
    queryKey: ["sceneButtons"],
    queryFn: sceneButtonApi.getAll,
  });

  const { data: cameras = [] } = useQuery({
    queryKey: ["cameras"],
    queryFn: cameraApi.getAll,
  });

  const { data: hueBridges = [] } = useQuery<{ id: number; name: string; status: string }[]>({
    queryKey: ["/api/hue/bridges"],
  });

  const sceneGroups = useMemo(() => {
    const groups = new Map<string, SceneButton[]>();
    for (const button of sceneButtons) {
      const groupName = getSceneGroupName(button);
      groups.set(groupName, [...(groups.get(groupName) || []), button]);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, buttons]) => ({ name, buttons }));
  }, [sceneButtons]);

  const groupNameOptions = useMemo(() => {
    return Array.from(new Set(["General", ...sceneButtons.map(getSceneGroupName), formData.groupName || "General"]))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }, [formData.groupName, sceneButtons]);

  const previewItems = useMemo(() => getFormPreview(formData, cameras), [formData, cameras]);

  useEffect(() => {
    localStorage.setItem("ptzcommand:operator-lock", operatorLocked ? "locked" : "unlocked");
  }, [operatorLocked]);

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

  const testMutation = useMutation({
    mutationFn: (section: SceneTestSection) => {
      if (!editingButton) throw new Error("Save the scene before testing hardware");
      return sceneButtonApi.test(editingButton.id, section);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["undo-status"] });
      toast.success("Scene test complete", {
        description: data.results.join("\n"),
        duration: 5000,
      });
    },
    onError: (e: Error) => toast.error("Scene test failed", { description: e.message, duration: 5000 }),
  });

  const openCreate = () => {
    if (operatorLocked) {
      toast.info("Operator lock is on");
      return;
    }
    const nextNum = sceneButtons.length > 0
      ? Math.max(...sceneButtons.map(b => b.buttonNumber)) + 1
      : 1;
    setEditingButton(null);
    setFormData({
      buttonNumber: nextNum,
      name: "",
      groupName: "General",
      color: COLORS[(nextNum - 1) % COLORS.length],
      atemInputId: null,
      atemTransitionType: "cut",
      cameraId: null,
      presetNumber: null,
      mixerActions: [],
      hueActions: [],
    });
    setEditOpen(true);
  };

  const openEdit = (btn: SceneButton) => {
    if (operatorLocked) {
      toast.info("Operator lock is on");
      return;
    }
    setEditingButton(btn);
    let mixerActions: MixerAction[] = [];
    try { if (btn.mixerActions) mixerActions = JSON.parse(btn.mixerActions); } catch {}
    let hueActions: HueSceneAction[] = [];
    try { if (btn.hueActions) hueActions = JSON.parse(btn.hueActions); } catch {}
    setFormData({
      buttonNumber: btn.buttonNumber,
      name: btn.name,
      groupName: getSceneGroupName(btn),
      color: btn.color,
      atemInputId: btn.atemInputId,
      atemTransitionType: btn.atemTransitionType || "cut",
      cameraId: btn.cameraId,
      presetNumber: btn.presetNumber,
      mixerActions,
      hueActions,
    });
    setEditOpen(true);
  };

  const handleSave = () => {
    if (operatorLocked) {
      toast.info("Operator lock is on");
      return;
    }
    const payload = {
      buttonNumber: formData.buttonNumber,
      name: formData.name || `Scene ${formData.buttonNumber}`,
      groupName: formData.groupName.trim() || "General",
      color: formData.color,
      atemInputId: formData.atemInputId,
      atemTransitionType: formData.atemTransitionType,
      cameraId: formData.cameraId,
      presetNumber: formData.presetNumber,
      mixerActions: formData.mixerActions.length > 0
        ? JSON.stringify(formData.mixerActions)
        : null,
      hueActions: formData.hueActions.length > 0
        ? JSON.stringify(formData.hueActions)
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

  const addHueAction = () => {
    setFormData(prev => ({
      ...prev,
      hueActions: [...prev.hueActions, { type: "scene", bridgeId: 0, sceneId: "" }],
    }));
  };

  const updateHueAction = (index: number, updates: Partial<HueSceneAction>) => {
    setFormData(prev => ({
      ...prev,
      hueActions: prev.hueActions.map((a, i) => i === index ? { ...a, ...updates } : a),
    }));
  };

  const removeHueAction = (index: number) => {
    setFormData(prev => ({
      ...prev,
      hueActions: prev.hueActions.filter((_, i) => i !== index),
    }));
  };

  return (
    <AppLayout
      activePage="/scenes"
      headerRight={
        <Button
          variant={operatorLocked ? "default" : "outline"}
          size="sm"
          onClick={() => setOperatorLocked((locked) => !locked)}
          data-testid="button-operator-lock"
        >
          {operatorLocked ? <Lock className="w-3 h-3 mr-1" /> : <Unlock className="w-3 h-3 mr-1" />}
          {operatorLocked ? "Locked" : "Operator Lock"}
        </Button>
      }
    >
      <main className="flex-1 p-6 flex flex-col gap-6 max-w-7xl mx-auto w-full">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Zap className="w-5 h-5 text-cyan-500" /> Scene Buttons
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Programmable buttons that trigger combined ATEM, mixer, and PTZ actions in one press.
            </p>
          </div>
          <Button onClick={openCreate} disabled={operatorLocked} data-testid="button-add-scene">
            <Plus className="w-4 h-4 mr-2" /> Add Scene Button
          </Button>
        </div>

        {operatorLocked && (
          <div className="border border-amber-500/40 bg-amber-500/10 rounded-lg px-4 py-3 text-sm text-amber-700 dark:text-amber-300 flex items-center gap-2">
            <Lock className="w-4 h-4" />
            Operator lock is on. Scene execution remains available; editing and deletion are disabled.
          </div>
        )}

        {sceneButtons.length === 0 ? (
          <div className="border-2 border-dashed border-slate-300 dark:border-slate-800 rounded-xl p-16 text-center">
            <Zap className="w-12 h-12 text-slate-400 dark:text-slate-700 mx-auto mb-4" />
            <p className="text-slate-500 mb-2">No scene buttons configured yet</p>
            <p className="text-sm text-slate-500 dark:text-slate-600 mb-6">Create a scene button to trigger combined actions across your ATEM switcher, audio mixer, and PTZ cameras.</p>
            <Button onClick={openCreate} disabled={operatorLocked} data-testid="button-add-first-scene">
              <Plus className="w-4 h-4 mr-2" /> Create Your First Scene
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            {sceneGroups.map((group) => (
              <section key={group.name} className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
                  <Folder className="w-4 h-4 text-cyan-500" />
                  {group.name}
                  <span className="text-xs text-slate-400 dark:text-slate-500">({group.buttons.length})</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {group.buttons.map((btn) => {
                    let mixerActions: MixerAction[] = [];
                    try { if (btn.mixerActions) mixerActions = JSON.parse(btn.mixerActions); } catch {}
                    let hueActionCount = 0;
                    try { if (btn.hueActions) hueActionCount = JSON.parse(btn.hueActions).length; } catch {}
                    const isActive = activeSceneId === btn.id;

                    return (
                      <div key={btn.id} className="relative group">
                        <button
                          onClick={() => executeMutation.mutate(btn.id)}
                          disabled={executeMutation.isPending}
                          className={cn(
                            "w-full rounded-xl font-bold text-sm transition-all",
                            "hover:scale-105 hover:shadow-lg active:scale-95",
                            "border-2 flex flex-col items-center justify-center gap-1 p-4"
                          )}
                          style={{
                            backgroundColor: isActive ? btn.color : `${btn.color}15`,
                            borderColor: btn.color,
                            color: isActive ? '#000' : btn.color,
                            boxShadow: isActive ? `0 0 30px ${btn.color}60` : `0 0 20px ${btn.color}20`,
                          }}
                          data-testid={`button-scene-execute-${btn.id}`}
                        >
                          <Play className="w-5 h-5 mb-1" style={{ color: isActive ? '#000' : btn.color }} />
                          <span className="text-base">{btn.name}</span>
                          <div className="flex flex-wrap gap-1 mt-2 justify-center">
                            {btn.atemInputId !== null && (
                              <span className={cn("text-[10px] px-1.5 py-0.5 rounded", isActive ? "bg-black/20 text-black/70" : "bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400")}>
                                ATEM:{btn.atemInputId}
                              </span>
                            )}
                            {btn.cameraId !== null && btn.presetNumber !== null && (
                              <span className={cn("text-[10px] px-1.5 py-0.5 rounded", isActive ? "bg-black/20 text-black/70" : "bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400")}>
                                CAM:{btn.cameraId} P{(btn.presetNumber ?? 0) + 1}
                              </span>
                            )}
                            {mixerActions.length > 0 && (
                              <span className={cn("text-[10px] px-1.5 py-0.5 rounded", isActive ? "bg-black/20 text-black/70" : "bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400")}>
                                MIX:{mixerActions.length}ch
                              </span>
                            )}
                            {hueActionCount > 0 && (
                              <span className={cn("text-[10px] px-1.5 py-0.5 rounded", isActive ? "bg-black/20 text-black/70" : "bg-yellow-200/80 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400")}>
                                HUE:{hueActionCount}
                              </span>
                            )}
                          </div>
                        </button>
                        {!operatorLocked && (
                          <button
                            onClick={(e) => { e.stopPropagation(); openEdit(btn); }}
                            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-300/80 dark:bg-slate-900/80 rounded p-1.5"
                            data-testid={`button-scene-edit-${btn.id}`}
                          >
                            <Settings className="w-3.5 h-3.5 text-slate-400" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

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
              <Label>Group</Label>
              <Input
                value={formData.groupName}
                onChange={(e) => setFormData(p => ({ ...p, groupName: e.target.value }))}
                placeholder={groupNameOptions[0] || "General"}
                list="scene-group-options"
                data-testid="input-scene-group"
              />
              <datalist id="scene-group-options">
                {groupNameOptions.map((name) => <option key={name} value={name} />)}
              </datalist>
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

            <div className="border border-cyan-500/30 bg-cyan-500/10 rounded-lg p-3">
              <h4 className="text-xs font-mono uppercase text-cyan-700 dark:text-cyan-300 mb-2 flex items-center gap-1.5">
                <ListChecks className="w-3 h-3" />Dry Run Preview
              </h4>
              <ul className="space-y-1">
                {previewItems.map((item, index) => (
                  <li key={`${item}-${index}`} className="text-xs text-slate-600 dark:text-slate-300">{item}</li>
                ))}
              </ul>
            </div>

            <div className="border-t border-slate-300 dark:border-slate-800 pt-3">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-mono uppercase text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <Lightbulb className="w-3 h-3 text-yellow-500" />Hue Lighting Actions
                </h4>
                <Button variant="outline" size="sm" className="text-xs h-6" onClick={addHueAction} data-testid="button-add-hue-action">
                  <Plus className="w-3 h-3 mr-1" /> Add Scene
                </Button>
              </div>
              {formData.hueActions.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-600">No Hue actions configured.</p>
              ) : (
                <div className="space-y-2">
                  {formData.hueActions.map((action, idx) => (
                    <HueActionRow
                      key={idx}
                      action={action}
                      bridges={hueBridges}
                      onUpdate={(u) => updateHueAction(idx, u)}
                      onRemove={() => removeHueAction(idx)}
                    />
                  ))}
                </div>
              )}
            </div>

            {editingButton && (
              <div className="border border-emerald-500/30 bg-emerald-500/10 rounded-lg p-3">
                <h4 className="text-xs font-mono uppercase text-emerald-700 dark:text-emerald-300 mb-2 flex items-center gap-1.5">
                  <FlaskConical className="w-3 h-3" />Test Mode
                </h4>
                <div className="grid grid-cols-4 gap-2">
                  {(["hue", "atem", "ptz", "mixer"] as SceneTestSection[]).map((section) => (
                    <Button
                      key={section}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-xs h-8"
                      disabled={!hasSceneSection(formData, section) || testMutation.isPending}
                      onClick={() => testMutation.mutate(section)}
                      data-testid={`button-test-scene-${section}`}
                    >
                      {section.toUpperCase()}
                    </Button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Tests run only the selected hardware section and add an undo step when rollback data is available.</p>
              </div>
            )}

            <div className="border-t border-slate-300 dark:border-slate-800 pt-3">
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

            <div className="border-t border-slate-300 dark:border-slate-800 pt-3">
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

            <div className="border-t border-slate-300 dark:border-slate-800 pt-3">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-mono uppercase text-slate-500 dark:text-slate-400">Mixer Channel Actions</h4>
                <Button variant="outline" size="sm" className="text-xs h-6" onClick={addMixerAction} data-testid="button-add-mixer-action">
                  <Plus className="w-3 h-3 mr-1" /> Add Channel
                </Button>
              </div>

              {formData.mixerActions.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-600">No mixer actions configured.</p>
              ) : (
                <div className="space-y-3">
                  {formData.mixerActions.map((action, idx) => (
                    <div key={idx} className="bg-slate-300 dark:bg-slate-800/50 rounded-lg p-3 space-y-2">
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
                                ? "bg-red-950/50 border-red-700 text-red-400"
                                : "bg-green-950/50 border-green-700 text-green-400"
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
                  disabled={operatorLocked}
                  onClick={() => { deleteMutation.mutate(editingButton.id); setEditOpen(false); }}
                  data-testid="button-delete-scene"
                >
                  <Trash2 className="w-3 h-3 mr-1" /> Delete
                </Button>
              )}
              <div className="flex-1" />
              <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={operatorLocked} data-testid="button-save-scene">
                {editingButton ? "Update" : "Create"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
