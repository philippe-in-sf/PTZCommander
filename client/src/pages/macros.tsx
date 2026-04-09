import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { macroApi, cameraApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Play, Clock, Camera, Monitor, ArrowUpDown, ZoomIn, Focus, Clapperboard, ChevronUp, ChevronDown, Copy, Pencil, Lightbulb } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AppLayout } from "@/components/app-layout";
import type { Macro, Camera as CameraType } from "@shared/schema";

interface MacroStep {
  id: string;
  type: string;
  cameraId?: number;
  presetNumber?: number;
  pan?: number;
  tilt?: number;
  speed?: number;
  direction?: number;
  duration?: number;
  inputId?: number;
  bridgeId?: number;
  sceneId?: string;
  groupId?: string;
  lightId?: string;
  on?: boolean;
  brightness?: number;
  colorTemp?: number;
}

const STEP_TYPES = [
  { value: "recall_preset", label: "Recall Preset", icon: Camera, category: "PTZ" },
  { value: "pan_tilt", label: "Pan/Tilt", icon: ArrowUpDown, category: "PTZ" },
  { value: "pan_tilt_stop", label: "Pan/Tilt Stop", icon: ArrowUpDown, category: "PTZ" },
  { value: "zoom", label: "Zoom", icon: ZoomIn, category: "PTZ" },
  { value: "focus_auto", label: "Auto Focus", icon: Focus, category: "PTZ" },
  { value: "atem_preview", label: "Set Preview Input", icon: Monitor, category: "ATEM" },
  { value: "atem_program", label: "Set Program Input", icon: Monitor, category: "ATEM" },
  { value: "atem_cut", label: "Cut Transition", icon: Clapperboard, category: "ATEM" },
  { value: "atem_auto", label: "Auto Transition", icon: Clapperboard, category: "ATEM" },
  { value: "delay", label: "Delay / Wait", icon: Clock, category: "Timing" },
  { value: "hue_scene", label: "Activate Hue Scene", icon: Lightbulb, category: "Lighting" },
  { value: "hue_group", label: "Control Room/Zone", icon: Lightbulb, category: "Lighting" },
  { value: "hue_light", label: "Control Light", icon: Lightbulb, category: "Lighting" },
];

const COLORS = [
  "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899",
  "#ef4444", "#f97316", "#eab308", "#22c55e",
];

function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

interface HueBridgeInfo { id: number; name: string; status: string; }
interface HueSceneInfo { id: string; name: string; group?: string; }
interface HueGroupInfo { id: string; name: string; }
interface HueLightInfo { id: string; name: string; }

function HueStepEditor({ step, onChange }: { step: MacroStep; onChange: (s: MacroStep) => void }) {
  const { data: bridges = [] } = useQuery<HueBridgeInfo[]>({ queryKey: ["/api/hue/bridges"] });
  const bridgeId = step.bridgeId;
  const { data: scenes = [] } = useQuery<HueSceneInfo[]>({
    queryKey: [`/api/hue/bridges/${bridgeId}/scenes`],
    enabled: !!bridgeId && step.type === "hue_scene",
  });
  const { data: groups = [] } = useQuery<HueGroupInfo[]>({
    queryKey: [`/api/hue/bridges/${bridgeId}/groups`],
    enabled: !!bridgeId && (step.type === "hue_group" || step.type === "hue_scene"),
  });
  const { data: lights = [] } = useQuery<HueLightInfo[]>({
    queryKey: [`/api/hue/bridges/${bridgeId}/lights`],
    enabled: !!bridgeId && step.type === "hue_light",
  });

  return (
    <div className="space-y-2 w-full">
      <div className="flex items-center gap-2">
        <Label className="text-[10px] uppercase text-slate-500 dark:text-slate-400 w-14 shrink-0">Bridge</Label>
        <Select
          value={step.bridgeId?.toString() || ""}
          onValueChange={(v) => onChange({ ...step, bridgeId: parseInt(v), sceneId: undefined, groupId: undefined, lightId: undefined })}
        >
          <SelectTrigger className="h-7 text-xs bg-slate-200 dark:bg-slate-900 border-slate-400/30 dark:border-slate-700 w-40">
            <SelectValue placeholder="Select bridge" />
          </SelectTrigger>
          <SelectContent>
            {bridges.map(b => <SelectItem key={b.id} value={b.id.toString()}>{b.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {step.type === "hue_scene" && bridgeId && (
        <>
          <div className="flex items-center gap-2">
            <Label className="text-[10px] uppercase text-slate-500 dark:text-slate-400 w-14 shrink-0">Scene</Label>
            <Select value={step.sceneId || ""} onValueChange={(v) => onChange({ ...step, sceneId: v })}>
              <SelectTrigger className="h-7 text-xs bg-slate-200 dark:bg-slate-900 border-slate-400/30 dark:border-slate-700 w-40">
                <SelectValue placeholder="Select scene" />
              </SelectTrigger>
              <SelectContent>
                {scenes.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-[10px] uppercase text-slate-500 dark:text-slate-400 w-14 shrink-0">Room</Label>
            <Select value={step.groupId || "_all"} onValueChange={(v) => onChange({ ...step, groupId: v === "_all" ? undefined : v })}>
              <SelectTrigger className="h-7 text-xs bg-slate-200 dark:bg-slate-900 border-slate-400/30 dark:border-slate-700 w-40">
                <SelectValue placeholder="All lights" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">All lights</SelectItem>
                {groups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </>
      )}

      {step.type === "hue_group" && bridgeId && (
        <>
          <div className="flex items-center gap-2">
            <Label className="text-[10px] uppercase text-slate-500 dark:text-slate-400 w-14 shrink-0">Room</Label>
            <Select value={step.groupId || ""} onValueChange={(v) => onChange({ ...step, groupId: v })}>
              <SelectTrigger className="h-7 text-xs bg-slate-200 dark:bg-slate-900 border-slate-400/30 dark:border-slate-700 w-40">
                <SelectValue placeholder="Select room" />
              </SelectTrigger>
              <SelectContent>
                {groups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Label className="text-[10px] uppercase text-slate-500 dark:text-slate-400 w-10 shrink-0">Power</Label>
              <Select value={step.on === undefined ? "_unchanged" : step.on ? "on" : "off"} onValueChange={(v) => onChange({ ...step, on: v === "_unchanged" ? undefined : v === "on" })}>
                <SelectTrigger className="h-7 text-xs bg-slate-200 dark:bg-slate-900 border-slate-400/30 dark:border-slate-700 w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_unchanged">Unchanged</SelectItem>
                  <SelectItem value="on">On</SelectItem>
                  <SelectItem value="off">Off</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-[10px] uppercase text-slate-500 dark:text-slate-400 w-16 shrink-0">Brightness</Label>
              <Input type="number" min={1} max={254} value={step.brightness ?? ""} placeholder="1–254"
                onChange={(e) => onChange({ ...step, brightness: e.target.value ? parseInt(e.target.value) : undefined })}
                className="h-7 text-xs bg-slate-200 dark:bg-slate-900 border-slate-400/30 dark:border-slate-700 w-20" />
            </div>
          </div>
        </>
      )}

      {step.type === "hue_light" && bridgeId && (
        <>
          <div className="flex items-center gap-2">
            <Label className="text-[10px] uppercase text-slate-500 dark:text-slate-400 w-14 shrink-0">Light</Label>
            <Select value={step.lightId || ""} onValueChange={(v) => onChange({ ...step, lightId: v })}>
              <SelectTrigger className="h-7 text-xs bg-slate-200 dark:bg-slate-900 border-slate-400/30 dark:border-slate-700 w-40">
                <SelectValue placeholder="Select light" />
              </SelectTrigger>
              <SelectContent>
                {lights.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Label className="text-[10px] uppercase text-slate-500 dark:text-slate-400 w-10 shrink-0">Power</Label>
              <Select value={step.on === undefined ? "_unchanged" : step.on ? "on" : "off"} onValueChange={(v) => onChange({ ...step, on: v === "_unchanged" ? undefined : v === "on" })}>
                <SelectTrigger className="h-7 text-xs bg-slate-200 dark:bg-slate-900 border-slate-400/30 dark:border-slate-700 w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_unchanged">Unchanged</SelectItem>
                  <SelectItem value="on">On</SelectItem>
                  <SelectItem value="off">Off</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-[10px] uppercase text-slate-500 dark:text-slate-400 w-16 shrink-0">Brightness</Label>
              <Input type="number" min={1} max={254} value={step.brightness ?? ""} placeholder="1–254"
                onChange={(e) => onChange({ ...step, brightness: e.target.value ? parseInt(e.target.value) : undefined })}
                className="h-7 text-xs bg-slate-200 dark:bg-slate-900 border-slate-400/30 dark:border-slate-700 w-20" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StepEditor({ step, cameras, onChange, onRemove, onMoveUp, onMoveDown, isFirst, isLast }: {
  step: MacroStep;
  cameras: CameraType[];
  onChange: (step: MacroStep) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const stepType = STEP_TYPES.find(s => s.value === step.type);
  const Icon = stepType?.icon || Clock;

  return (
    <div className="flex items-start gap-2 p-3 bg-slate-300/50 dark:bg-slate-800/50 rounded-lg border border-slate-400/30 dark:border-slate-700 group" data-testid={`macro-step-${step.id}`}>
      <div className="flex flex-col gap-0.5 pt-1">
        <button
          onClick={onMoveUp}
          disabled={isFirst}
          className="p-0.5 rounded hover:bg-slate-400/50 dark:hover:bg-slate-700 disabled:opacity-20 text-slate-500 dark:text-slate-400"
          data-testid={`step-move-up-${step.id}`}
        >
          <ChevronUp className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onMoveDown}
          disabled={isLast}
          className="p-0.5 rounded hover:bg-slate-400/50 dark:hover:bg-slate-700 disabled:opacity-20 text-slate-500 dark:text-slate-400"
          data-testid={`step-move-down-${step.id}`}
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-cyan-500/20 dark:bg-cyan-500/10 flex items-center justify-center">
            <Icon className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
          </div>
          <span className="text-xs font-mono uppercase text-slate-500 dark:text-slate-400">{stepType?.category}</span>
          <Select value={step.type} onValueChange={(val) => onChange({ ...step, type: val })}>
            <SelectTrigger className="h-7 text-xs flex-1 bg-slate-200 dark:bg-slate-900 border-slate-400/30 dark:border-slate-700" data-testid={`step-type-${step.id}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STEP_TYPES.map(t => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {(step.type === "recall_preset" || step.type === "pan_tilt" || step.type === "pan_tilt_stop" || step.type === "zoom" || step.type === "focus_auto") && (
          <div className="flex items-center gap-2">
            <Label className="text-[10px] uppercase text-slate-500 dark:text-slate-400 w-14 shrink-0">Camera</Label>
            <Select
              value={step.cameraId?.toString() || ""}
              onValueChange={(val) => onChange({ ...step, cameraId: parseInt(val) })}
            >
              <SelectTrigger className="h-7 text-xs bg-slate-200 dark:bg-slate-900 border-slate-400/30 dark:border-slate-700" data-testid={`step-camera-${step.id}`}>
                <SelectValue placeholder="Select camera" />
              </SelectTrigger>
              <SelectContent>
                {cameras.map(c => (
                  <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {step.type === "recall_preset" && (
          <div className="flex items-center gap-2">
            <Label className="text-[10px] uppercase text-slate-500 dark:text-slate-400 w-14 shrink-0">Preset</Label>
            <Select
              value={step.presetNumber?.toString() || ""}
              onValueChange={(val) => onChange({ ...step, presetNumber: parseInt(val) })}
            >
              <SelectTrigger className="h-7 text-xs bg-slate-200 dark:bg-slate-900 border-slate-400/30 dark:border-slate-700" data-testid={`step-preset-${step.id}`}>
                <SelectValue placeholder="Select preset" />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 16 }, (_, i) => (
                  <SelectItem key={i} value={i.toString()}>Preset {i + 1}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {step.type === "pan_tilt" && (
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-[10px] uppercase text-slate-500 dark:text-slate-400">Pan</Label>
              <Input
                type="number"
                min={-1}
                max={1}
                step={0.1}
                value={step.pan || 0}
                onChange={(e) => onChange({ ...step, pan: parseFloat(e.target.value) })}
                className="h-7 text-xs bg-slate-200 dark:bg-slate-900 border-slate-400/30 dark:border-slate-700"
                data-testid={`step-pan-${step.id}`}
              />
            </div>
            <div>
              <Label className="text-[10px] uppercase text-slate-500 dark:text-slate-400">Tilt</Label>
              <Input
                type="number"
                min={-1}
                max={1}
                step={0.1}
                value={step.tilt || 0}
                onChange={(e) => onChange({ ...step, tilt: parseFloat(e.target.value) })}
                className="h-7 text-xs bg-slate-200 dark:bg-slate-900 border-slate-400/30 dark:border-slate-700"
                data-testid={`step-tilt-${step.id}`}
              />
            </div>
            <div>
              <Label className="text-[10px] uppercase text-slate-500 dark:text-slate-400">Speed</Label>
              <Input
                type="number"
                min={0}
                max={1}
                step={0.1}
                value={step.speed || 0.5}
                onChange={(e) => onChange({ ...step, speed: parseFloat(e.target.value) })}
                className="h-7 text-xs bg-slate-200 dark:bg-slate-900 border-slate-400/30 dark:border-slate-700"
                data-testid={`step-speed-${step.id}`}
              />
            </div>
          </div>
        )}

        {step.type === "zoom" && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px] uppercase text-slate-500 dark:text-slate-400">Direction</Label>
              <Select
                value={(step.direction || 1).toString()}
                onValueChange={(val) => onChange({ ...step, direction: parseInt(val) })}
              >
                <SelectTrigger className="h-7 text-xs bg-slate-200 dark:bg-slate-900 border-slate-400/30 dark:border-slate-700" data-testid={`step-zoom-dir-${step.id}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Zoom In</SelectItem>
                  <SelectItem value="-1">Zoom Out</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] uppercase text-slate-500 dark:text-slate-400">Speed</Label>
              <Input
                type="number"
                min={0}
                max={1}
                step={0.1}
                value={step.speed || 0.5}
                onChange={(e) => onChange({ ...step, speed: parseFloat(e.target.value) })}
                className="h-7 text-xs bg-slate-200 dark:bg-slate-900 border-slate-400/30 dark:border-slate-700"
                data-testid={`step-zoom-speed-${step.id}`}
              />
            </div>
          </div>
        )}

        {(step.type === "atem_preview" || step.type === "atem_program") && (
          <div className="flex items-center gap-2">
            <Label className="text-[10px] uppercase text-slate-500 dark:text-slate-400 w-14 shrink-0">Input</Label>
            <Input
              type="number"
              min={1}
              max={20}
              value={step.inputId || 1}
              onChange={(e) => onChange({ ...step, inputId: parseInt(e.target.value) })}
              className="h-7 text-xs bg-slate-200 dark:bg-slate-900 border-slate-400/30 dark:border-slate-700 w-24"
              data-testid={`step-input-${step.id}`}
            />
          </div>
        )}

        {step.type === "delay" && (
          <div className="flex items-center gap-2">
            <Label className="text-[10px] uppercase text-slate-500 dark:text-slate-400 w-14 shrink-0">Duration</Label>
            <Input
              type="number"
              min={50}
              max={30000}
              step={50}
              value={step.duration || 1000}
              onChange={(e) => onChange({ ...step, duration: parseInt(e.target.value) })}
              className="h-7 text-xs bg-slate-200 dark:bg-slate-900 border-slate-400/30 dark:border-slate-700 w-24"
              data-testid={`step-delay-${step.id}`}
            />
            <span className="text-[10px] text-slate-500 dark:text-slate-400">ms</span>
          </div>
        )}

        {(step.type === "hue_scene" || step.type === "hue_group" || step.type === "hue_light") && (
          <HueStepEditor step={step} onChange={onChange} />
        )}
      </div>

      <button
        onClick={onRemove}
        className="p-1 rounded hover:bg-red-500/20 text-slate-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
        data-testid={`step-remove-${step.id}`}
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function stepSummary(step: MacroStep, cameras: CameraType[]): string {
  const cam = cameras.find(c => c.id === step.cameraId);
  const camName = cam?.name || `Cam ${step.cameraId}`;
  switch (step.type) {
    case "recall_preset": return `${camName} → Preset ${(step.presetNumber || 0) + 1}`;
    case "pan_tilt": return `${camName} Pan/Tilt (${step.pan}, ${step.tilt})`;
    case "pan_tilt_stop": return `${camName} Stop`;
    case "zoom": return `${camName} Zoom ${step.direction === -1 ? "Out" : "In"}`;
    case "focus_auto": return `${camName} Auto Focus`;
    case "atem_preview": return `Preview → Input ${step.inputId}`;
    case "atem_program": return `Program → Input ${step.inputId}`;
    case "atem_cut": return "Cut Transition";
    case "atem_auto": return "Auto Transition";
    case "delay": return `Wait ${step.duration || 1000}ms`;
    case "hue_scene": return `Hue Scene${step.sceneId ? ` (${step.sceneId.slice(0, 8)})` : ""}`;
    case "hue_group": return `Room ${step.groupId || "?"} ${step.on !== undefined ? (step.on ? "→ On" : "→ Off") : ""}`;
    case "hue_light": return `Light ${step.lightId || "?"} ${step.on !== undefined ? (step.on ? "→ On" : "→ Off") : ""}`;
    default: return step.type;
  }
}

export default function MacrosPage() {
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [editingMacro, setEditingMacro] = useState<Macro | null>(null);
  const [executingId, setExecutingId] = useState<number | null>(null);

  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formColor, setFormColor] = useState("#06b6d4");
  const [formSteps, setFormSteps] = useState<MacroStep[]>([]);

  const { data: allMacros = [] } = useQuery({
    queryKey: ["macros"],
    queryFn: macroApi.getAll,
  });

  const { data: cameras = [] } = useQuery({
    queryKey: ["cameras"],
    queryFn: cameraApi.getAll,
  });

  const createMutation = useMutation({
    mutationFn: macroApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["macros"] });
      toast.success("Macro created");
      closeEditor();
    },
    onError: () => toast.error("Failed to create macro"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: any }) => macroApi.update(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["macros"] });
      toast.success("Macro updated");
      closeEditor();
    },
    onError: () => toast.error("Failed to update macro"),
  });

  const deleteMutation = useMutation({
    mutationFn: macroApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["macros"] });
      toast.success("Macro deleted");
    },
    onError: () => toast.error("Failed to delete macro"),
  });

  const executeMutation = useMutation({
    mutationFn: macroApi.execute,
    onSuccess: (data) => {
      toast.success(data.message);
      setExecutingId(null);
    },
    onError: () => {
      toast.error("Macro execution failed");
      setExecutingId(null);
    },
  });

  function openNew() {
    setEditingMacro(null);
    setFormName("");
    setFormDescription("");
    setFormNotes("");
    setFormColor("#06b6d4");
    setFormSteps([]);
    setEditOpen(true);
  }

  function openEdit(macro: Macro) {
    setEditingMacro(macro);
    setFormName(macro.name);
    setFormDescription(macro.description || "");
    setFormNotes(macro.notes || "");
    setFormColor(macro.color);
    try {
      const parsed = JSON.parse(macro.steps);
      setFormSteps(parsed.map((s: any) => ({ ...s, id: s.id || generateId() })));
    } catch {
      setFormSteps([]);
    }
    setEditOpen(true);
  }

  function duplicateMacro(macro: Macro) {
    createMutation.mutate({
      name: `${macro.name} (copy)`,
      description: macro.description,
      notes: macro.notes,
      color: macro.color,
      steps: macro.steps,
    });
  }

  function closeEditor() {
    setEditOpen(false);
    setEditingMacro(null);
  }

  function addStep() {
    setFormSteps(prev => [...prev, { id: generateId(), type: "recall_preset", duration: 1000 }]);
  }

  function updateStep(index: number, step: MacroStep) {
    setFormSteps(prev => prev.map((s, i) => i === index ? step : s));
  }

  function removeStep(index: number) {
    setFormSteps(prev => prev.filter((_, i) => i !== index));
  }

  function moveStep(index: number, direction: -1 | 1) {
    const newSteps = [...formSteps];
    const target = index + direction;
    if (target < 0 || target >= newSteps.length) return;
    [newSteps[index], newSteps[target]] = [newSteps[target], newSteps[index]];
    setFormSteps(newSteps);
  }

  function saveMacro() {
    if (!formName.trim()) {
      toast.error("Macro name is required");
      return;
    }
    if (formSteps.length === 0) {
      toast.error("Add at least one step");
      return;
    }

    const stepsJson = JSON.stringify(formSteps.map(({ id, ...rest }) => rest));

    if (editingMacro) {
      updateMutation.mutate({
        id: editingMacro.id,
        updates: { name: formName, description: formDescription || null, notes: formNotes || null, color: formColor, steps: stepsJson },
      });
    } else {
      createMutation.mutate({
        name: formName,
        description: formDescription || null,
        notes: formNotes || null,
        color: formColor,
        steps: stepsJson,
      });
    }
  }

  function executeMacro(id: number) {
    setExecutingId(id);
    executeMutation.mutate(id);
  }

  return (
    <AppLayout activePage="/macros">
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold" data-testid="text-macros-title">Macro Builder</h2>
              <p className="text-sm text-muted-foreground">Create sequences of PTZ and switcher commands that execute in order</p>
            </div>
            <Button onClick={openNew} className="gap-2" data-testid="button-new-macro">
              <Plus className="w-4 h-4" /> New Macro
            </Button>
          </div>

          {allMacros.length === 0 ? (
            <div className="bg-slate-300/50 dark:bg-slate-900/50 border border-slate-400/30 dark:border-slate-800 rounded-xl p-12 text-center">
              <Clapperboard className="w-12 h-12 mx-auto text-slate-400 dark:text-slate-600 mb-4" />
              <h3 className="text-lg font-semibold mb-2">No macros yet</h3>
              <p className="text-sm text-muted-foreground mb-4">Create a macro to chain multiple PTZ commands into a single sequence</p>
              <Button onClick={openNew} variant="outline" className="gap-2" data-testid="button-new-macro-empty">
                <Plus className="w-4 h-4" /> Create your first macro
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {allMacros.map(macro => {
                const steps = (() => { try { return JSON.parse(macro.steps); } catch { return []; } })();
                const isExecuting = executingId === macro.id;

                return (
                  <div
                    key={macro.id}
                    className="bg-slate-300/50 dark:bg-slate-900/50 border border-slate-400/30 dark:border-slate-800 rounded-xl p-4 group relative"
                    data-testid={`macro-card-${macro.id}`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: macro.color }} />
                        <h3 className="font-bold text-sm">{macro.name}</h3>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => duplicateMacro(macro)}
                          className="p-1.5 rounded hover:bg-slate-400/50 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400"
                          data-testid={`macro-duplicate-${macro.id}`}
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => openEdit(macro)}
                          className="p-1.5 rounded hover:bg-slate-400/50 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400"
                          data-testid={`macro-edit-${macro.id}`}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => deleteMutation.mutate(macro.id)}
                          className="p-1.5 rounded hover:bg-red-500/20 text-slate-500 hover:text-red-500"
                          data-testid={`macro-delete-${macro.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {macro.description && (
                      <p className="text-xs text-muted-foreground mb-2" data-testid={`macro-description-${macro.id}`}>{macro.description}</p>
                    )}

                    {macro.notes && (
                      <div className="mb-3 p-2 rounded-md bg-slate-400/20 dark:bg-slate-800/60 border border-slate-400/20 dark:border-slate-700/50">
                        <p className="text-xs text-slate-600 dark:text-slate-400 whitespace-pre-wrap" data-testid={`macro-notes-${macro.id}`}>{macro.notes}</p>
                      </div>
                    )}

                    <div className="space-y-1 mb-4 max-h-40 overflow-auto">
                      {steps.map((step: any, idx: number) => (
                        <div key={idx} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                          <span className="w-4 h-4 rounded-full bg-slate-400/30 dark:bg-slate-800 flex items-center justify-center text-[9px] font-bold shrink-0">{idx + 1}</span>
                          <span className="truncate">{stepSummary(step, cameras)}</span>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono text-slate-500 dark:text-slate-500">{steps.length} step{steps.length !== 1 ? "s" : ""}</span>
                      <Button
                        size="sm"
                        onClick={() => executeMacro(macro.id)}
                        disabled={isExecuting}
                        className="gap-1.5 h-8"
                        data-testid={`macro-run-${macro.id}`}
                      >
                        <Play className="w-3.5 h-3.5" />
                        {isExecuting ? "Running..." : "Run"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="bg-slate-300 dark:bg-slate-900 border-slate-400/30 dark:border-slate-700 max-w-2xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>{editingMacro ? "Edit Macro" : "Create Macro"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs uppercase text-slate-500 dark:text-slate-400">Name</Label>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="My macro"
                  className="bg-slate-200 dark:bg-slate-800 border-slate-400/30 dark:border-slate-700"
                  data-testid="input-macro-name"
                />
              </div>
              <div>
                <Label className="text-xs uppercase text-slate-500 dark:text-slate-400">Description</Label>
                <Input
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Short description"
                  className="bg-slate-200 dark:bg-slate-800 border-slate-400/30 dark:border-slate-700"
                  data-testid="input-macro-description"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs uppercase text-slate-500 dark:text-slate-400">Notes</Label>
              <textarea
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="Usage instructions, tips, or any details about this macro..."
                rows={3}
                className="w-full mt-1 rounded-md px-3 py-2 text-sm bg-slate-200 dark:bg-slate-800 border border-slate-400/30 dark:border-slate-700 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y"
                data-testid="input-macro-notes"
              />
            </div>

            <div>
              <Label className="text-xs uppercase text-slate-500 dark:text-slate-400 mb-2 block">Color</Label>
              <div className="flex gap-2">
                {COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setFormColor(c)}
                    className={cn(
                      "w-7 h-7 rounded-full border-2 transition-transform",
                      formColor === c ? "border-white dark:border-white scale-110 shadow-lg" : "border-transparent hover:scale-105"
                    )}
                    style={{ backgroundColor: c }}
                    data-testid={`macro-color-${c}`}
                  />
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs uppercase text-slate-500 dark:text-slate-400">Steps ({formSteps.length})</Label>
                <Button variant="outline" size="sm" onClick={addStep} className="h-7 text-xs gap-1" data-testid="button-add-step">
                  <Plus className="w-3 h-3" /> Add Step
                </Button>
              </div>

              {formSteps.length === 0 ? (
                <div className="border border-dashed border-slate-400/30 dark:border-slate-700 rounded-lg p-6 text-center">
                  <p className="text-sm text-muted-foreground">No steps yet. Add commands to build your macro sequence.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-auto pr-1">
                  {formSteps.map((step, idx) => (
                    <StepEditor
                      key={step.id}
                      step={step}
                      cameras={cameras}
                      onChange={(s) => updateStep(idx, s)}
                      onRemove={() => removeStep(idx)}
                      onMoveUp={() => moveStep(idx, -1)}
                      onMoveDown={() => moveStep(idx, 1)}
                      isFirst={idx === 0}
                      isLast={idx === formSteps.length - 1}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={closeEditor} data-testid="button-cancel-macro">Cancel</Button>
              <Button onClick={saveMacro} className="gap-2" data-testid="button-save-macro">
                {editingMacro ? "Update Macro" : "Create Macro"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
