import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  cameraApi,
  displayApi,
  mixerApi,
  obsApi,
  sceneButtonApi,
  switcherApi,
  type ObsScene,
  type SceneCaptureMode,
  type SceneCaptureSection,
} from "@/lib/api";
import type { AtemState } from "@/hooks/use-atem-control";
import type { Camera, DisplayDevice, Preset, SceneButton } from "@shared/schema";
import {
  Camera as CameraIcon,
  Folder,
  Lightbulb,
  Lock,
  ListChecks,
  Monitor,
  Play,
  Plus,
  Radio,
  Save,
  Search,
  SlidersHorizontal,
  Trash2,
  Unlock,
  Video,
  Zap,
} from "lucide-react";

type SceneTab = "overview" | "switcher" | "graphics" | "cameras" | "audio" | "lighting" | "displays";
type SceneTestSection = "atem" | "obs" | "mixer" | "hue" | "ptz" | "display";
type MixerSection = "ch" | "bus" | "auxin" | "fxrtn" | "mtx" | "dca" | "main";
type HueActionType = "scene" | "group" | "light";

interface MixerAction {
  section: MixerSection;
  channel: number;
  fader?: number;
  muted?: boolean;
  name?: string;
}

interface SceneAtemDskState {
  index: number;
  onAir?: boolean;
  tie?: boolean;
  rate?: number;
}

interface SceneAtemUskState {
  index: number;
  onAir?: boolean;
}

interface SceneAtemAuxState {
  index: number;
  sourceId: number;
}

interface SceneAtemState {
  programInput?: number | null;
  previewInput?: number | null;
  transitionStyle?: number;
  transitionPreview?: boolean;
  mixRate?: number;
  dipRate?: number;
  wipeRate?: number;
  fadeToBlackRate?: number;
  downstreamKeyers?: SceneAtemDskState[];
  upstreamKeyers?: SceneAtemUskState[];
  auxOutputs?: SceneAtemAuxState[];
}

interface HueSceneAction {
  type: HueActionType;
  bridgeId: number;
  sceneId?: string;
  groupId?: string;
  lightId?: string;
  on?: boolean;
  brightness?: number;
  colorTemp?: number;
  hue?: number;
  sat?: number;
}

interface DisplayAction {
  displayId: number;
  command: "power_on" | "power_off" | "power_toggle" | "set_volume" | "volume_up" | "volume_down" | "mute" | "unmute" | "set_input" | "custom";
  value?: string | number | boolean;
  capability?: string;
  smartthingsCommand?: string;
  arguments?: unknown[];
  displayName?: string;
}

interface HueBridgeSummary {
  id: number;
  name: string;
  status: string;
}

interface HueGroup {
  id: string;
  name: string;
  type: string;
  lights: string[];
  on: boolean;
  brightness: number;
}

interface HueScene {
  id: string;
  name: string;
  group?: string;
}

interface HueLight {
  id: string;
  name: string;
  on: boolean;
  brightness: number;
  colorTemp?: number;
  reachable: boolean;
  type: string;
}

interface MixerStatusResponse {
  connected: boolean;
  sections?: Partial<Record<MixerSection, MixerAction[]>>;
  channels?: MixerAction[];
}

type SceneDraft = {
  buttonNumber: number;
  name: string;
  groupName: string;
  color: string;
  atemInputId: number | null;
  atemTransitionType: string;
  atemState: SceneAtemState | null;
  obsSceneName: string;
  cameraId: number | null;
  presetNumber: number | null;
  mixerActions: MixerAction[];
  hueActions: HueSceneAction[];
  displayActions: DisplayAction[];
};

type CaptureSectionsState = Record<SceneCaptureSection, boolean>;

type SceneCaptureDraft = {
  mode: SceneCaptureMode;
  targetSceneId: number | null;
  name: string;
  buttonNumber: number;
  groupName: string;
  color: string;
  sections: CaptureSectionsState;
};

const COLORS = [
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
];

const MIXER_SECTION_OPTIONS: Array<{ value: MixerSection; label: string }> = [
  { value: "ch", label: "Channel" },
  { value: "bus", label: "Mix Bus" },
  { value: "auxin", label: "Aux In" },
  { value: "fxrtn", label: "FX Return" },
  { value: "mtx", label: "Matrix" },
  { value: "dca", label: "DCA" },
  { value: "main", label: "Main LR" },
];

const TRANSITION_STYLE_OPTIONS = [
  { value: 0, label: "Mix" },
  { value: 1, label: "Dip" },
  { value: 2, label: "Wipe" },
  { value: 3, label: "DVE" },
  { value: 4, label: "Sting" },
];

const CAPTURE_SECTION_OPTIONS: Array<{
  value: SceneCaptureSection;
  title: string;
  description: string;
}> = [
  {
    value: "atem",
    title: "Switcher + camera routing",
    description: "Program, preview, transitions, keyers, auxes, and whichever mapped cameras are live on the switcher.",
  },
  {
    value: "obs",
    title: "Graphics / OBS",
    description: "Current OBS program scene, using a live read when available.",
  },
  {
    value: "mixer",
    title: "Audio",
    description: "All readable X32 channel, bus, matrix, DCA, and main states.",
  },
  {
    value: "hue",
    title: "Lighting",
    description: "Readable Hue light states across connected bridges.",
  },
  {
    value: "display",
    title: "Displays",
    description: "Power, volume, mute, and input state from each configured display.",
  },
];

const DEFAULT_CAPTURE_SECTIONS: CaptureSectionsState = {
  atem: true,
  obs: true,
  mixer: true,
  hue: true,
  display: true,
};

function parseJsonArray<T>(value: string | null | undefined): T[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonObject<T>(value: string | null | undefined): T | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as T : null;
  } catch {
    return null;
  }
}

function getSceneGroupName(scene: Pick<SceneButton, "groupName">) {
  return scene.groupName?.trim() || "General";
}

function createEmptyDraft(buttonNumber: number): SceneDraft {
  return {
    buttonNumber,
    name: "",
    groupName: "General",
    color: COLORS[(buttonNumber - 1) % COLORS.length],
    atemInputId: null,
    atemTransitionType: "cut",
    atemState: null,
    obsSceneName: "",
    cameraId: null,
    presetNumber: null,
    mixerActions: [],
    hueActions: [],
    displayActions: [],
  };
}

function getNextButtonNumber(sceneButtons: SceneButton[]) {
  return sceneButtons.length > 0
    ? Math.max(...sceneButtons.map((scene) => scene.buttonNumber)) + 1
    : 1;
}

function createSceneCaptureDraft(sceneButtons: SceneButton[], selectedSceneId: number | null): SceneCaptureDraft {
  const nextButtonNumber = getNextButtonNumber(sceneButtons);
  const mergeTargetSceneId = selectedSceneId ?? sceneButtons[0]?.id ?? null;

  return {
    mode: "create",
    targetSceneId: mergeTargetSceneId,
    name: `Scene ${nextButtonNumber}`,
    buttonNumber: nextButtonNumber,
    groupName: "General",
    color: COLORS[(nextButtonNumber - 1) % COLORS.length],
    sections: { ...DEFAULT_CAPTURE_SECTIONS },
  };
}

function sceneToDraft(scene: SceneButton): SceneDraft {
  return {
    buttonNumber: scene.buttonNumber,
    name: scene.name,
    groupName: getSceneGroupName(scene),
    color: scene.color,
    atemInputId: scene.atemInputId,
    atemTransitionType: scene.atemTransitionType || "cut",
    atemState: parseJsonObject<SceneAtemState>(scene.atemState),
    obsSceneName: scene.obsSceneName || "",
    cameraId: scene.cameraId,
    presetNumber: scene.presetNumber,
    mixerActions: parseJsonArray<MixerAction>(scene.mixerActions),
    hueActions: parseJsonArray<HueSceneAction>(scene.hueActions),
    displayActions: parseJsonArray<DisplayAction>(scene.displayActions),
  };
}

function serializeDraft(draft: SceneDraft) {
  const validDisplayActions = draft.displayActions.filter((action) => action.displayId > 0 && action.command);
  return {
    buttonNumber: draft.buttonNumber,
    name: draft.name.trim() || `Scene ${draft.buttonNumber}`,
    groupName: draft.groupName.trim() || "General",
    color: draft.color,
    atemInputId: draft.atemState?.programInput ?? draft.atemInputId,
    atemState: draft.atemState ? JSON.stringify(draft.atemState) : null,
    atemTransitionType: draft.atemTransitionType,
    obsSceneName: draft.obsSceneName.trim() || null,
    cameraId: draft.cameraId,
    presetNumber: draft.presetNumber,
    mixerActions: draft.mixerActions.length > 0 ? JSON.stringify(draft.mixerActions) : null,
    hueActions: draft.hueActions.length > 0 ? JSON.stringify(draft.hueActions) : null,
    displayActions: validDisplayActions.length > 0 ? JSON.stringify(validDisplayActions) : null,
  };
}

function summarizeAtemState(atemState: SceneAtemState | null, fallbackInputId: number | null, transitionType: string) {
  if (atemState) {
    const parts: string[] = [];
    if (atemState.programInput) parts.push(`program ${atemState.programInput}`);
    if (atemState.previewInput) parts.push(`preview ${atemState.previewInput}`);
    if (atemState.auxOutputs?.length) parts.push(`${atemState.auxOutputs.length} aux`);
    if (atemState.downstreamKeyers?.length) parts.push(`${atemState.downstreamKeyers.length} DSK`);
    if (atemState.upstreamKeyers?.length) parts.push(`${atemState.upstreamKeyers.length} USK`);
    return parts.length > 0 ? `ATEM: ${parts.join(" · ")}` : "ATEM: switcher state captured";
  }
  if (fallbackInputId !== null) {
    return `ATEM: ${transitionType === "auto" ? "auto" : "cut"} to input ${fallbackInputId}`;
  }
  return null;
}

function getScenePreview(draft: SceneDraft, cameras: Camera[], presets: Preset[], displays: DisplayDevice[]) {
  const preview: string[] = [];

  const atemPreview = summarizeAtemState(draft.atemState, draft.atemInputId, draft.atemTransitionType);
  if (atemPreview) preview.push(atemPreview);

  if (draft.obsSceneName.trim()) {
    preview.push(`OBS: program scene ${draft.obsSceneName.trim()}`);
  }

  if (draft.cameraId !== null && draft.presetNumber !== null) {
    const cameraName = cameras.find((camera) => camera.id === draft.cameraId)?.name || `Camera ${draft.cameraId}`;
    const presetName = presets.find((preset) => preset.presetNumber === draft.presetNumber)?.name;
    preview.push(`PTZ: ${cameraName} recalls ${presetName || `Preset ${draft.presetNumber + 1}`}`);
  }

  if (draft.mixerActions.length > 0) {
    preview.push(`Audio: ${draft.mixerActions.length} mixer action(s)`);
  }

  if (draft.hueActions.length > 0) {
    preview.push(`Lighting: ${draft.hueActions.length} cue(s)`);
  }

  if (draft.displayActions.length > 0) {
    const names = draft.displayActions
      .map((action) => displays.find((display) => display.id === action.displayId)?.name || action.displayName)
      .filter(Boolean)
      .slice(0, 2)
      .join(", ");
    preview.push(`Displays: ${draft.displayActions.length} command(s)${names ? ` for ${names}` : ""}`);
  }

  return preview.length > 0 ? preview : ["No device actions configured yet"];
}

function buildAtemStateFromStatus(status: AtemState): SceneAtemState {
  return {
    programInput: status.programInput || undefined,
    previewInput: status.previewInput || undefined,
    transitionStyle: status.transition?.nextStyle ?? status.transition?.style,
    transitionPreview: status.transition?.previewEnabled,
    mixRate: status.transition?.mixRate,
    dipRate: status.transition?.dipRate,
    wipeRate: status.transition?.wipeRate,
    fadeToBlackRate: status.fadeToBlack?.rate,
    downstreamKeyers: (status.downstreamKeyers || []).map((keyer: any) => ({
      index: keyer.index,
      onAir: keyer.onAir,
      tie: keyer.tie,
      rate: keyer.rate,
    })),
    upstreamKeyers: (status.upstreamKeyers || []).map((keyer: any) => ({
      index: keyer.index,
      onAir: keyer.onAir,
    })),
    auxOutputs: (status.auxOutputs || []).map((sourceId, index) => ({ index, sourceId })),
  };
}

function buildMixerActionsFromStatus(status: MixerStatusResponse): MixerAction[] {
  if (status.sections) {
    const sectionOrder: MixerSection[] = ["ch", "bus", "auxin", "fxrtn", "mtx", "dca", "main"];
    return sectionOrder.flatMap((section) =>
      (status.sections?.[section] || []).map((action) => ({
        section,
        channel: action.channel,
        fader: action.fader,
        muted: action.muted,
        name: action.name,
      })),
    );
  }

  return (status.channels || []).map((action) => ({
    section: "ch",
    channel: action.channel,
    fader: action.fader,
    muted: action.muted,
    name: action.name,
  }));
}

function buildDisplayActionsFromState(displays: DisplayDevice[]): DisplayAction[] {
  const actions: DisplayAction[] = [];

  for (const display of displays) {
    if (display.powerState === "on") {
      actions.push({ displayId: display.id, command: "power_on", displayName: display.name });
    } else if (display.powerState === "off") {
      actions.push({ displayId: display.id, command: "power_off", displayName: display.name });
    }

    if (typeof display.volume === "number") {
      actions.push({ displayId: display.id, command: "set_volume", value: display.volume, displayName: display.name });
    }

    actions.push({ displayId: display.id, command: display.muted ? "mute" : "unmute", displayName: display.name });

    if (display.inputSource) {
      actions.push({ displayId: display.id, command: "set_input", value: display.inputSource, displayName: display.name });
    }
  }

  return actions;
}

function sceneHasSection(draft: SceneDraft, section: SceneTestSection) {
  if (section === "atem") return Boolean(draft.atemState) || draft.atemInputId !== null;
  if (section === "obs") return Boolean(draft.obsSceneName.trim());
  if (section === "ptz") return draft.cameraId !== null && draft.presetNumber !== null;
  if (section === "mixer") return draft.mixerActions.length > 0;
  if (section === "hue") return draft.hueActions.length > 0;
  return draft.displayActions.length > 0;
}

function StatusBadge({ label, online }: { label: string; online: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium",
        online
          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
          : "bg-slate-500/15 text-slate-600 dark:text-slate-300",
      )}
    >
      {label}
    </span>
  );
}

function SectionCard({
  title,
  description,
  icon,
  actions,
  children,
}: {
  title: string;
  description?: string;
  icon: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200/70 bg-white/80 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
            <span className="text-cyan-500">{icon}</span>
            {title}
          </div>
          {description ? <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

function MixerActionEditor({
  action,
  onUpdate,
  onRemove,
}: {
  action: MixerAction;
  onUpdate: (updates: Partial<MixerAction>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-3 dark:border-slate-800 dark:bg-slate-900/70">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
            {action.name || "Mixer Action"}
          </div>
          <div className="text-sm text-slate-500 dark:text-slate-400">
            {action.section.toUpperCase()} {action.channel}
          </div>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
          <Trash2 className="h-4 w-4 text-red-500" />
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_100px_1fr_auto] md:items-end">
        <div>
          <Label className="text-xs">Section</Label>
          <Select value={action.section} onValueChange={(value) => onUpdate({ section: value as MixerSection })}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MIXER_SECTION_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs">Channel</Label>
          <Input
            className="mt-1"
            type="number"
            min={1}
            value={action.channel}
            onChange={(event) => onUpdate({ channel: Math.max(1, Number.parseInt(event.target.value, 10) || 1) })}
          />
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Fader</span>
            <span>{Math.round((action.fader ?? 0.75) * 100)}%</span>
          </div>
          <Slider
            value={[action.fader ?? 0.75]}
            min={0}
            max={1}
            step={0.01}
            onValueChange={([value]) => onUpdate({ fader: value })}
          />
        </div>

        <div className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-800">
          <Label className="text-xs">Mute</Label>
          <Switch checked={Boolean(action.muted)} onCheckedChange={(checked) => onUpdate({ muted: checked })} />
        </div>
      </div>
    </div>
  );
}

function HueActionRow({
  action,
  bridges,
  onUpdate,
  onRemove,
}: {
  action: HueSceneAction;
  bridges: HueBridgeSummary[];
  onUpdate: (updates: Partial<HueSceneAction>) => void;
  onRemove: () => void;
}) {
  const bridgeId = action.bridgeId || 0;

  const { data: groups = [] } = useQuery<HueGroup[]>({
    queryKey: [`/api/hue/bridges/${bridgeId}/groups`],
    enabled: bridgeId > 0,
  });

  const { data: scenes = [] } = useQuery<HueScene[]>({
    queryKey: [`/api/hue/bridges/${bridgeId}/scenes`],
    enabled: bridgeId > 0 && action.type === "scene",
  });

  const { data: lights = [] } = useQuery<HueLight[]>({
    queryKey: [`/api/hue/bridges/${bridgeId}/lights`],
    enabled: bridgeId > 0 && action.type === "light",
  });

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-3 dark:border-slate-800 dark:bg-slate-900/70">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
          Lighting Cue
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
          <Trash2 className="h-4 w-4 text-red-500" />
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <Label className="text-xs">Bridge</Label>
          <Select
            value={bridgeId > 0 ? String(bridgeId) : "0"}
            onValueChange={(value) => onUpdate({ bridgeId: Number.parseInt(value, 10), sceneId: undefined, groupId: undefined, lightId: undefined })}
          >
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Select bridge" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Select bridge</SelectItem>
              {bridges.map((bridge) => (
                <SelectItem key={bridge.id} value={String(bridge.id)}>
                  {bridge.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs">Action Type</Label>
          <Select
            value={action.type}
            onValueChange={(value) =>
              onUpdate({
                type: value as HueActionType,
                sceneId: undefined,
                groupId: undefined,
                lightId: undefined,
                on: value === "scene" ? undefined : true,
                brightness: value === "scene" ? undefined : 200,
              })
            }
          >
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="scene">Recall scene</SelectItem>
              <SelectItem value="group">Set room state</SelectItem>
              <SelectItem value="light">Set light state</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {action.type === "scene" ? (
          <div>
            <Label className="text-xs">Scene</Label>
            <Select value={action.sceneId || "none"} onValueChange={(value) => onUpdate({ sceneId: value === "none" ? undefined : value })}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select scene" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select scene</SelectItem>
                {scenes.map((scene) => (
                  <SelectItem key={scene.id} value={scene.id}>
                    {scene.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : action.type === "group" ? (
          <div>
            <Label className="text-xs">Room</Label>
            <Select value={action.groupId || "none"} onValueChange={(value) => onUpdate({ groupId: value === "none" ? undefined : value })}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select room" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select room</SelectItem>
                {groups.map((group) => (
                  <SelectItem key={group.id} value={group.id}>
                    {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div>
            <Label className="text-xs">Light</Label>
            <Select value={action.lightId || "none"} onValueChange={(value) => onUpdate({ lightId: value === "none" ? undefined : value })}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select light" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select light</SelectItem>
                {lights.map((light) => (
                  <SelectItem key={light.id} value={light.id}>
                    {light.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {action.type !== "scene" ? (
        <div className="mt-3 grid gap-3 md:grid-cols-[auto_1fr_110px] md:items-center">
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-800">
            <Label className="text-xs">On</Label>
            <Switch checked={Boolean(action.on)} onCheckedChange={(checked) => onUpdate({ on: checked })} />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Brightness</span>
              <span>{Math.round(((action.brightness ?? 200) / 254) * 100)}%</span>
            </div>
            <Slider
              value={[action.brightness ?? 200]}
              min={1}
              max={254}
              step={1}
              onValueChange={([value]) => onUpdate({ brightness: value })}
            />
          </div>

          <div>
            <Label className="text-xs">Color Temp</Label>
            <Input
              className="mt-1"
              type="number"
              min={153}
              max={500}
              value={action.colorTemp ?? ""}
              placeholder="Optional"
              onChange={(event) =>
                onUpdate({
                  colorTemp: event.target.value ? Number.parseInt(event.target.value, 10) : undefined,
                })
              }
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DisplayActionRow({
  action,
  displays,
  onUpdate,
  onRemove,
}: {
  action: DisplayAction;
  displays: DisplayDevice[];
  onUpdate: (updates: Partial<DisplayAction>) => void;
  onRemove: () => void;
}) {
  const needsValue = action.command === "set_volume" || action.command === "set_input" || action.command === "custom";

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-3 dark:border-slate-800 dark:bg-slate-900/70">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
          Display Command
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
          <Trash2 className="h-4 w-4 text-red-500" />
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <Label className="text-xs">Display</Label>
          <Select value={String(action.displayId || 0)} onValueChange={(value) => onUpdate({ displayId: Number.parseInt(value, 10) })}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Select display</SelectItem>
              {displays.map((display) => (
                <SelectItem key={display.id} value={String(display.id)}>
                  {display.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs">Command</Label>
          <Select value={action.command} onValueChange={(value) => onUpdate({ command: value as DisplayAction["command"], value: undefined })}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="power_on">Power On</SelectItem>
              <SelectItem value="power_off">Power Off</SelectItem>
              <SelectItem value="power_toggle">Power Toggle</SelectItem>
              <SelectItem value="set_volume">Set Volume</SelectItem>
              <SelectItem value="volume_up">Volume Up</SelectItem>
              <SelectItem value="volume_down">Volume Down</SelectItem>
              <SelectItem value="mute">Mute</SelectItem>
              <SelectItem value="unmute">Unmute</SelectItem>
              <SelectItem value="set_input">Set Input</SelectItem>
              <SelectItem value="custom">Custom SmartThings</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {needsValue ? (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div>
            <Label className="text-xs">
              {action.command === "set_volume" ? "Volume" : action.command === "set_input" ? "Input" : "Value"}
            </Label>
            <Input
              className="mt-1"
              type={action.command === "set_volume" ? "number" : "text"}
              min={0}
              max={100}
              value={action.value?.toString() || ""}
              onChange={(event) =>
                onUpdate({
                  value: action.command === "set_volume" ? Number.parseInt(event.target.value, 10) || 0 : event.target.value,
                })
              }
            />
          </div>

          {action.command === "custom" ? (
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label className="text-xs">Capability</Label>
                <Input className="mt-1" value={action.capability || ""} onChange={(event) => onUpdate({ capability: event.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Command</Label>
                <Input className="mt-1" value={action.smartthingsCommand || ""} onChange={(event) => onUpdate({ smartthingsCommand: event.target.value })} />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SceneRow({
  scene,
  selected,
  active,
  preview,
  onSelect,
  onRecall,
}: {
  scene: SceneButton;
  selected: boolean;
  active: boolean;
  preview: string[];
  onSelect: () => void;
  onRecall: () => void;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-3 transition-all",
        selected
          ? "border-cyan-500/50 bg-cyan-500/10 shadow-[0_0_0_1px_rgba(6,182,212,0.15)]"
          : "border-slate-200/70 bg-white/70 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950/60 dark:hover:border-slate-700",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={onSelect} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: scene.color }} />
            <span className="truncate text-sm font-semibold text-slate-900 dark:text-white">{scene.name}</span>
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Slot {scene.buttonNumber} · {getSceneGroupName(scene)}
          </div>
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {preview[0]}
          </div>
        </button>
        <Button type="button" size="sm" variant={active ? "default" : "outline"} onClick={onRecall}>
          <Play className="mr-1 h-3.5 w-3.5" />
          Go
        </Button>
      </div>
    </div>
  );
}

export default function ScenesPage() {
  const queryClient = useQueryClient();
  const [selectedSceneId, setSelectedSceneId] = useState<number | null>(null);
  const [draft, setDraft] = useState<SceneDraft | null>(null);
  const [activeSceneId, setActiveSceneId] = useState<number | null>(null);
  const [captureDialogOpen, setCaptureDialogOpen] = useState(false);
  const [captureDraft, setCaptureDraft] = useState<SceneCaptureDraft | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<SceneTab>("overview");
  const [operatorLocked, setOperatorLocked] = useState(() => localStorage.getItem("ptzcommand:operator-lock") === "locked");
  const deferredSearch = useDeferredValue(search);

  const { data: sceneButtons = [] } = useQuery({
    queryKey: ["sceneButtons"],
    queryFn: sceneButtonApi.getAll,
  });

  const { data: cameras = [] } = useQuery({
    queryKey: ["cameras"],
    queryFn: cameraApi.getAll,
  });

  const { data: displays = [] } = useQuery({
    queryKey: ["displays"],
    queryFn: displayApi.getAll,
  });

  const { data: mixers = [] } = useQuery({
    queryKey: ["mixers"],
    queryFn: mixerApi.getAll,
  });

  const { data: switchers = [] } = useQuery({
    queryKey: ["switchers"],
    queryFn: switcherApi.getAll,
  });

  const { data: obsConnections = [] } = useQuery({
    queryKey: ["obs"],
    queryFn: obsApi.getAll,
  });

  const { data: hueBridges = [] } = useQuery<HueBridgeSummary[]>({
    queryKey: ["/api/hue/bridges"],
  });

  const switcher = switchers[0] ?? null;
  const mixer = mixers[0] ?? null;
  const obsConnection = obsConnections[0] ?? null;

  const { data: switcherStatus } = useQuery<AtemState>({
    queryKey: ["switcher-status", switcher?.id],
    queryFn: () => switcherApi.getStatus(switcher!.id),
    enabled: Boolean(switcher),
  });

  const { data: obsScenesResult } = useQuery<{ scenes: ObsScene[]; state: { currentProgramScene?: string | null } }>({
    queryKey: ["obs-scenes", obsConnection?.id],
    queryFn: () => obsApi.getScenes(obsConnection!.id),
    enabled: Boolean(obsConnection),
    retry: false,
  });

  const { data: selectedCameraPresets = [] } = useQuery<Preset[]>({
    queryKey: ["scene-camera-presets", draft?.cameraId],
    queryFn: () => draft?.cameraId ? cameraApi.getPresets(draft.cameraId) : Promise.resolve([]),
    enabled: Boolean(draft?.cameraId),
  });

  const obsSceneNames = useMemo(() => {
    const liveScenes = obsScenesResult?.scenes?.map((scene) => scene.sceneName) || [];
    if (!draft?.obsSceneName) return liveScenes;
    return liveScenes.includes(draft.obsSceneName) ? liveScenes : [draft.obsSceneName, ...liveScenes];
  }, [draft?.obsSceneName, obsScenesResult?.scenes]);

  const scenePreviewById = useMemo(() => {
    const previewEntries: Array<[number, string[]]> = sceneButtons.map((scene) => [
      scene.id,
      getScenePreview(sceneToDraft(scene), cameras, [], displays),
    ]);
    return new Map<number, string[]>(previewEntries);
  }, [cameras, displays, sceneButtons]);

  const filteredSceneGroups = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    const filtered = query
      ? sceneButtons.filter((scene) =>
          [scene.name, getSceneGroupName(scene), scene.buttonNumber.toString()].some((value) => value.toLowerCase().includes(query)),
        )
      : sceneButtons;

    const groups = new Map<string, SceneButton[]>();
    for (const scene of filtered) {
      const groupName = getSceneGroupName(scene);
      groups.set(groupName, [...(groups.get(groupName) || []), scene]);
    }

    return Array.from(groups.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, scenes]) => ({ name, scenes }));
  }, [deferredSearch, sceneButtons]);

  const groupNameOptions = useMemo(
    () =>
      Array.from(new Set(["General", ...sceneButtons.map(getSceneGroupName), draft?.groupName || "General"]))
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right)),
    [draft?.groupName, sceneButtons],
  );

  const livePreview = useMemo(
    () => draft ? getScenePreview(draft, cameras, selectedCameraPresets, displays) : ["Select or create a scene"],
    [cameras, displays, draft, selectedCameraPresets],
  );

  useEffect(() => {
    localStorage.setItem("ptzcommand:operator-lock", operatorLocked ? "locked" : "unlocked");
  }, [operatorLocked]);

  useEffect(() => {
    if (draft) return;
    if (sceneButtons.length > 0) {
      const firstScene = sceneButtons[0];
      setSelectedSceneId(firstScene.id);
      setDraft(sceneToDraft(firstScene));
      return;
    }
    setDraft(createEmptyDraft(getNextButtonNumber(sceneButtons)));
  }, [draft, sceneButtons]);

  function updateDraft(updates: Partial<SceneDraft>) {
    setDraft((current) => current ? { ...current, ...updates } : current);
    setIsDirty(true);
  }

  function confirmSceneSwitch() {
    return !isDirty || window.confirm("Discard unsaved scene changes?");
  }

  function selectScene(scene: SceneButton) {
    if (!confirmSceneSwitch()) return;
    startTransition(() => {
      setSelectedSceneId(scene.id);
      setDraft(sceneToDraft(scene));
      setIsDirty(false);
      setActiveTab("overview");
    });
  }

  function startNewScene() {
    if (operatorLocked) {
      toast.info("Operator lock is on");
      return;
    }
    if (!confirmSceneSwitch()) return;
    const nextButtonNumber = getNextButtonNumber(sceneButtons);
    startTransition(() => {
      setSelectedSceneId(null);
      setDraft(createEmptyDraft(nextButtonNumber));
      setIsDirty(false);
      setActiveTab("overview");
    });
  }

  function updateCaptureDraft(updates: Partial<SceneCaptureDraft>) {
    setCaptureDraft((current) => current ? { ...current, ...updates } : current);
  }

  function updateCaptureSections(section: SceneCaptureSection, checked: boolean) {
    setCaptureDraft((current) =>
      current
        ? {
            ...current,
            sections: {
              ...current.sections,
              [section]: checked,
            },
          }
        : current,
    );
  }

  function openCaptureDialog() {
    if (operatorLocked) {
      toast.info("Operator lock is on");
      return;
    }

    setCaptureDraft(createSceneCaptureDraft(sceneButtons, selectedSceneId));
    setCaptureDialogOpen(true);
  }

  const createMutation = useMutation({
    mutationFn: sceneButtonApi.create,
    onSuccess: (scene) => {
      queryClient.invalidateQueries({ queryKey: ["sceneButtons"] });
      setSelectedSceneId(scene.id);
      setDraft(sceneToDraft(scene));
      setIsDirty(false);
      toast.success(`Scene "${scene.name}" created`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: Partial<SceneButton> }) => sceneButtonApi.update(id, updates),
    onSuccess: (scene) => {
      queryClient.invalidateQueries({ queryKey: ["sceneButtons"] });
      setSelectedSceneId(scene.id);
      setDraft(sceneToDraft(scene));
      setIsDirty(false);
      toast.success(`Scene "${scene.name}" saved`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: sceneButtonApi.delete,
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["sceneButtons"] });
      const remaining = sceneButtons.filter((scene) => scene.id !== id);
      const nextScene = remaining[0];
      setSelectedSceneId(nextScene?.id ?? null);
      setDraft(nextScene ? sceneToDraft(nextScene) : createEmptyDraft(getNextButtonNumber(remaining)));
      setIsDirty(false);
      toast.success("Scene deleted");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const executeMutation = useMutation({
    mutationFn: (id: number) => {
      setActiveSceneId(id);
      return sceneButtonApi.execute(id);
    },
    onSuccess: (data, id) => {
      setActiveSceneId(id);
      toast.success("Scene recalled", {
        description: data.results.join("\n"),
        duration: 5000,
      });
    },
    onError: (error: Error) => toast.error("Scene recall failed", { description: error.message }),
  });

  const testMutation = useMutation({
    mutationFn: (section: SceneTestSection) => {
      if (!selectedSceneId) throw new Error("Save the scene before testing hardware");
      return sceneButtonApi.test(selectedSceneId, section);
    },
    onSuccess: (data, section) => {
      toast.success(`${section.toUpperCase()} test complete`, {
        description: data.results.join("\n"),
        duration: 5000,
      });
    },
    onError: (error: Error) => toast.error("Scene test failed", { description: error.message }),
  });

  const captureMutation = useMutation({
    mutationFn: sceneButtonApi.capture,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["sceneButtons"] });
      setSelectedSceneId(data.scene.id);
      setDraft(sceneToDraft(data.scene));
      setIsDirty(false);
      setActiveTab("overview");
      setCaptureDialogOpen(false);
      toast.success(data.mode === "merge" ? `Merged live state into "${data.scene.name}"` : `Created "${data.scene.name}" from live state`, {
        description: [...data.results, ...data.warnings].join("\n"),
        duration: 7000,
      });
    },
    onError: (error: Error) => toast.error("Capture failed", { description: error.message }),
  });

  async function saveScene() {
    if (!draft) return;
    if (operatorLocked) {
      toast.info("Operator lock is on");
      return;
    }

    const payload = serializeDraft(draft);
    if (selectedSceneId) {
      updateMutation.mutate({ id: selectedSceneId, updates: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  function captureCurrentStateAsScene() {
    if (!captureDraft) return;

    const sections = CAPTURE_SECTION_OPTIONS
      .filter((section) => captureDraft.sections[section.value])
      .map((section) => section.value);

    if (sections.length === 0) {
      toast.error("Pick at least one section to capture");
      return;
    }

    if (captureDraft.mode === "merge" && !captureDraft.targetSceneId) {
      toast.error("Choose a scene to merge into");
      return;
    }

    captureMutation.mutate({
      mode: captureDraft.mode,
      targetSceneId: captureDraft.mode === "merge" ? captureDraft.targetSceneId || undefined : undefined,
      sections,
      scene: captureDraft.mode === "create"
        ? {
            name: captureDraft.name.trim() || undefined,
            buttonNumber: captureDraft.buttonNumber,
            groupName: captureDraft.groupName.trim() || undefined,
            color: captureDraft.color,
          }
        : undefined,
    });
  }

  async function captureSwitcherState() {
    if (!switcher || !switcherStatus?.connected) {
      toast.error("Connect the ATEM switcher first");
      return;
    }
    updateDraft({
      atemState: buildAtemStateFromStatus(switcherStatus),
      atemInputId: switcherStatus.programInput || null,
    });
    toast.success("Captured live switcher state");
  }

  async function captureObsState() {
    const sceneName = obsScenesResult?.state?.currentProgramScene || obsConnection?.currentProgramScene;
    if (!sceneName) {
      toast.error("No live OBS program scene available");
      return;
    }
    updateDraft({ obsSceneName: sceneName });
    toast.success(`Captured OBS scene "${sceneName}"`);
  }

  async function captureMixerState() {
    if (!mixer) {
      toast.error("Add a mixer first");
      return;
    }
    try {
      const status = await mixerApi.getStatus(mixer.id);
      const actions = buildMixerActionsFromStatus(status as MixerStatusResponse);
      updateDraft({ mixerActions: actions });
      toast.success(`Captured ${actions.length} mixer channel actions`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to capture mixer state");
    }
  }

  async function captureLightingState() {
    if (hueBridges.length === 0) {
      toast.error("Add a Hue bridge first");
      return;
    }

    try {
      const bridgeSnapshots = await Promise.all(
        hueBridges.map(async (bridge) => {
          const response = await fetch(`/api/hue/bridges/${bridge.id}/groups`);
          if (!response.ok) throw new Error(`Failed to read groups from ${bridge.name}`);
          const groups = await response.json() as HueGroup[];
          return groups.map((group) => ({
            type: "group" as const,
            bridgeId: bridge.id,
            groupId: group.id,
            on: group.on,
            brightness: group.brightness,
          }));
        }),
      );

      const actions = bridgeSnapshots.flat();
      updateDraft({ hueActions: actions });
      toast.success(`Captured ${actions.length} live lighting groups`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to capture lighting state");
    }
  }

  async function captureDisplayState() {
    if (displays.length === 0) {
      toast.error("Add a display first");
      return;
    }
    const actions = buildDisplayActionsFromState(displays);
    updateDraft({ displayActions: actions });
    toast.success(`Captured ${actions.length} display commands from current state`);
  }

  if (!draft) {
    return (
      <AppLayout activePage="/scenes">
        <main className="flex flex-1 items-center justify-center">
          <div className="text-sm text-slate-500">Loading scenes...</div>
        </main>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      activePage="/scenes"
      headerRight={
        <Button variant={operatorLocked ? "default" : "outline"} size="sm" onClick={() => setOperatorLocked((locked) => !locked)}>
          {operatorLocked ? <Lock className="mr-1.5 h-3.5 w-3.5" /> : <Unlock className="mr-1.5 h-3.5 w-3.5" />}
          {operatorLocked ? "Locked" : "Operator Lock"}
        </Button>
      }
    >
      <Dialog open={captureDialogOpen} onOpenChange={setCaptureDialogOpen}>
        <DialogContent className="max-w-3xl border-slate-200 bg-white/95 dark:border-slate-800 dark:bg-slate-950/95">
          <DialogHeader>
            <DialogTitle>Capture Current State As Scene</DialogTitle>
            <DialogDescription>
              Take one server-side snapshot of the live room state, then save it as a new scene or merge the selected sections into an existing one.
            </DialogDescription>
          </DialogHeader>

          {captureDraft ? (
            <div className="space-y-6">
              <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="space-y-4">
                  <div>
                    <Label className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Save Mode</Label>
                    <RadioGroup
                      className="mt-3 gap-3"
                      value={captureDraft.mode}
                      onValueChange={(value) =>
                        updateCaptureDraft({
                          mode: value as SceneCaptureMode,
                          targetSceneId: value === "merge" ? selectedSceneId : captureDraft.targetSceneId,
                        })
                      }
                    >
                      <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                        <RadioGroupItem value="create" id="scene-capture-create" className="mt-1" />
                        <div>
                          <div className="text-sm font-semibold text-slate-900 dark:text-white">Create a new scene</div>
                          <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                            Save the live snapshot into a fresh slot, then continue editing it here if needed.
                          </div>
                        </div>
                      </label>

                      <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                        <RadioGroupItem value="merge" id="scene-capture-merge" className="mt-1" />
                        <div>
                          <div className="text-sm font-semibold text-slate-900 dark:text-white">Merge into an existing scene</div>
                          <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                            Replace only the checked sections and leave the rest of that scene intact.
                          </div>
                        </div>
                      </label>
                    </RadioGroup>
                  </div>

                  {captureDraft.mode === "create" ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <Label>Name</Label>
                        <Input
                          className="mt-1"
                          value={captureDraft.name}
                          onChange={(event) => updateCaptureDraft({ name: event.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Slot</Label>
                        <Input
                          className="mt-1"
                          type="number"
                          min={1}
                          value={captureDraft.buttonNumber}
                          onChange={(event) =>
                            updateCaptureDraft({ buttonNumber: Math.max(1, Number.parseInt(event.target.value, 10) || 1) })
                          }
                        />
                      </div>
                      <div>
                        <Label>Group</Label>
                        <Input
                          className="mt-1"
                          list="capture-scene-group-options"
                          value={captureDraft.groupName}
                          onChange={(event) => updateCaptureDraft({ groupName: event.target.value })}
                        />
                        <datalist id="capture-scene-group-options">
                          {groupNameOptions.map((groupName) => (
                            <option key={groupName} value={groupName} />
                          ))}
                        </datalist>
                      </div>
                      <div>
                        <Label>Color</Label>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {COLORS.map((color) => (
                            <button
                              key={color}
                              type="button"
                              onClick={() => updateCaptureDraft({ color })}
                              className={cn(
                                "h-7 w-7 rounded-full border-2 transition-transform",
                                captureDraft.color === color ? "scale-110 border-slate-900 dark:border-white" : "border-transparent",
                              )}
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <Label>Merge Target</Label>
                      <Select
                        value={captureDraft.targetSceneId ? String(captureDraft.targetSceneId) : "none"}
                        onValueChange={(value) => updateCaptureDraft({ targetSceneId: value === "none" ? null : Number.parseInt(value, 10) })}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Select scene" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Select scene</SelectItem>
                          {sceneButtons.map((scene) => (
                            <SelectItem key={scene.id} value={String(scene.id)}>
                              {scene.buttonNumber}. {scene.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <div>
                    <Label className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Snapshot Sections</Label>
                    <div className="mt-3 space-y-3">
                      {CAPTURE_SECTION_OPTIONS.map((section) => (
                        <label
                          key={section.value}
                          className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/60"
                        >
                          <Checkbox
                            checked={captureDraft.sections[section.value]}
                            onCheckedChange={(checked) => updateCaptureSections(section.value, Boolean(checked))}
                            className="mt-1"
                          />
                          <div>
                            <div className="text-sm font-semibold text-slate-900 dark:text-white">{section.title}</div>
                            <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">{section.description}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-4 text-sm text-slate-600 dark:text-slate-300">
                    Current PTZ pose is not directly readable from the VISCA camera links yet. Capturing the switcher still preserves whichever mapped cameras are live on program or preview, and any saved PTZ preset link already on a merged scene is left alone.
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setCaptureDialogOpen(false)} disabled={captureMutation.isPending}>
              Cancel
            </Button>
            <Button onClick={captureCurrentStateAsScene} disabled={!captureDraft || captureMutation.isPending || operatorLocked}>
              <CameraIcon className="mr-2 h-4 w-4" />
              {captureMutation.isPending ? "Capturing..." : captureDraft?.mode === "merge" ? "Merge Snapshot" : "Capture Scene"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-6 p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xl font-semibold text-slate-900 dark:text-white">
              <Zap className="h-5 w-5 text-cyan-500" />
              Scene Editor
            </div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Build recallable broadcast scenes that bundle switcher, graphics, cameras, audio, lighting, and display state.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge label={`${sceneButtons.length} saved`} online={sceneButtons.length > 0} />
            <StatusBadge label={isDirty ? "Unsaved changes" : "Saved"} online={!isDirty} />
            <Button variant="outline" onClick={openCaptureDialog} disabled={operatorLocked}>
              <CameraIcon className="mr-2 h-4 w-4" />
              Capture Current State
            </Button>
            <Button onClick={startNewScene} disabled={operatorLocked}>
              <Plus className="mr-2 h-4 w-4" />
              New Scene
            </Button>
          </div>
        </div>

        {operatorLocked ? (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
            Operator lock is on. Recalling scenes still works, but editing, saving, and deleting are disabled.
          </div>
        ) : null}

        <div className="grid flex-1 gap-6 xl:grid-cols-[330px_minmax(0,1fr)]">
          <aside className="rounded-3xl border border-slate-200/70 bg-white/85 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/75">
            <div className="mb-4">
              <Label className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Scene Library</Label>
              <div className="relative mt-2">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input className="pl-9" placeholder="Search scenes or groups" value={search} onChange={(event) => setSearch(event.target.value)} />
              </div>
            </div>

            <ScrollArea className="h-[calc(100vh-260px)] pr-3">
              {filteredSceneGroups.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  No scenes match this search.
                </div>
              ) : (
                <div className="space-y-5">
                  {filteredSceneGroups.map((group) => (
                    <section key={group.name} className="space-y-3">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                        <Folder className="h-3.5 w-3.5 text-cyan-500" />
                        {group.name}
                      </div>
                      <div className="space-y-2">
                        {group.scenes.map((scene) => (
                          <SceneRow
                            key={scene.id}
                            scene={scene}
                            selected={selectedSceneId === scene.id}
                            active={activeSceneId === scene.id}
                            preview={scenePreviewById.get(scene.id) || ["No actions configured"]}
                            onSelect={() => selectScene(scene)}
                            onRecall={() => executeMutation.mutate(scene.id)}
                          />
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </ScrollArea>
          </aside>

          <section className="space-y-6">
            <div className="rounded-3xl border border-slate-200/70 bg-white/85 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950/75">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-4 lg:min-w-[360px] lg:max-w-[460px]">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label>Name</Label>
                      <Input value={draft.name} onChange={(event) => updateDraft({ name: event.target.value })} placeholder={`Scene ${draft.buttonNumber}`} />
                    </div>
                    <div>
                      <Label>Slot</Label>
                      <Input
                        type="number"
                        min={1}
                        value={draft.buttonNumber}
                        onChange={(event) => updateDraft({ buttonNumber: Math.max(1, Number.parseInt(event.target.value, 10) || 1) })}
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label>Group</Label>
                      <Input value={draft.groupName} list="scene-group-options" onChange={(event) => updateDraft({ groupName: event.target.value })} />
                      <datalist id="scene-group-options">
                        {groupNameOptions.map((groupName) => (
                          <option key={groupName} value={groupName} />
                        ))}
                      </datalist>
                    </div>

                    <div>
                      <Label>Color</Label>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {COLORS.map((color) => (
                          <button
                            key={color}
                            type="button"
                            onClick={() => updateDraft({ color })}
                            className={cn(
                              "h-7 w-7 rounded-full border-2 transition-transform",
                              draft.color === color ? "scale-110 border-slate-900 dark:border-white" : "border-transparent",
                            )}
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-3 lg:items-end">
                  <div className="flex flex-wrap gap-2">
                    {selectedSceneId ? (
                      <Button variant="outline" onClick={() => executeMutation.mutate(selectedSceneId)} disabled={executeMutation.isPending}>
                        <Play className="mr-2 h-4 w-4" />
                        Recall Scene
                      </Button>
                    ) : null}
                    <Button onClick={saveScene} disabled={operatorLocked || createMutation.isPending || updateMutation.isPending}>
                      <Save className="mr-2 h-4 w-4" />
                      Save Scene
                    </Button>
                    {selectedSceneId ? (
                      <Button
                        variant="outline"
                        onClick={() => {
                          if (operatorLocked) {
                            toast.info("Operator lock is on");
                            return;
                          }
                          if (window.confirm("Delete this scene?")) {
                            deleteMutation.mutate(selectedSceneId);
                          }
                        }}
                        disabled={operatorLocked || deleteMutation.isPending}
                      >
                        <Trash2 className="mr-2 h-4 w-4 text-red-500" />
                        Delete
                      </Button>
                    ) : null}
                  </div>

                  {selectedSceneId ? (
                    <div className="flex flex-wrap gap-2">
                      {(["atem", "obs", "mixer", "hue", "ptz", "display"] as SceneTestSection[]).map((section) => (
                        <Button
                          key={section}
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => testMutation.mutate(section)}
                          disabled={!sceneHasSection(draft, section) || testMutation.isPending}
                        >
                          Test {section.toUpperCase()}
                        </Button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Save this draft once to enable per-section hardware testing.
                    </p>
                  )}
                </div>
              </div>

              <Separator className="my-5" />

              <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
                <div>
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                    <ListChecks className="h-4 w-4 text-cyan-500" />
                    Dry Run Preview
                  </div>
                  <div className="space-y-2">
                    {livePreview.map((item, index) => (
                      <div key={`${item}-${index}`} className="rounded-xl bg-slate-100/80 px-3 py-2 text-sm text-slate-600 dark:bg-slate-900/80 dark:text-slate-300">
                        {item}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <button type="button" onClick={captureSwitcherState} className="rounded-2xl border border-slate-200 bg-slate-50/90 p-4 text-left transition hover:border-cyan-400 dark:border-slate-800 dark:bg-slate-900/70">
                    <Video className="mb-3 h-4 w-4 text-cyan-500" />
                    <div className="font-semibold text-slate-900 dark:text-white">Capture switcher</div>
                    <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      {switcherStatus?.connected ? `Program ${switcherStatus.programInput} · Preview ${switcherStatus.previewInput}` : "No live ATEM state"}
                    </div>
                  </button>

                  <button type="button" onClick={captureObsState} className="rounded-2xl border border-slate-200 bg-slate-50/90 p-4 text-left transition hover:border-cyan-400 dark:border-slate-800 dark:bg-slate-900/70">
                    <Radio className="mb-3 h-4 w-4 text-indigo-500" />
                    <div className="font-semibold text-slate-900 dark:text-white">Capture graphics</div>
                    <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      {obsScenesResult?.state?.currentProgramScene || obsConnection?.currentProgramScene || "No live OBS scene"}
                    </div>
                  </button>

                  <button type="button" onClick={captureMixerState} className="rounded-2xl border border-slate-200 bg-slate-50/90 p-4 text-left transition hover:border-cyan-400 dark:border-slate-800 dark:bg-slate-900/70">
                    <SlidersHorizontal className="mb-3 h-4 w-4 text-emerald-500" />
                    <div className="font-semibold text-slate-900 dark:text-white">Capture audio</div>
                    <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      {mixer ? `${mixer.name} · ${mixer.status}` : "No mixer configured"}
                    </div>
                  </button>

                  <button type="button" onClick={captureLightingState} className="rounded-2xl border border-slate-200 bg-slate-50/90 p-4 text-left transition hover:border-cyan-400 dark:border-slate-800 dark:bg-slate-900/70">
                    <Lightbulb className="mb-3 h-4 w-4 text-yellow-500" />
                    <div className="font-semibold text-slate-900 dark:text-white">Capture lighting</div>
                    <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      {hueBridges.length > 0 ? `${hueBridges.length} bridge(s)` : "No Hue bridge configured"}
                    </div>
                  </button>
                </div>
              </div>
            </div>

            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as SceneTab)} className="space-y-4">
              <TabsList className="h-auto w-full flex-wrap justify-start gap-2 rounded-2xl bg-transparent p-0">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="switcher">Switcher</TabsTrigger>
                <TabsTrigger value="graphics">Graphics</TabsTrigger>
                <TabsTrigger value="cameras">Cameras</TabsTrigger>
                <TabsTrigger value="audio">Audio</TabsTrigger>
                <TabsTrigger value="lighting">Lighting</TabsTrigger>
                <TabsTrigger value="displays">Displays</TabsTrigger>
              </TabsList>

              <TabsContent value="overview">
                <SectionCard
                  title="Scene Coverage"
                  description="Each saved scene can recall any combination of broadcast state. Use the detailed tabs to fine-tune what this scene owns."
                  icon={<Zap className="h-4 w-4" />}
                >
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <div className="rounded-2xl bg-slate-100/80 p-4 dark:bg-slate-900/80">
                      <div className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Switcher</div>
                      <div className="mt-2 text-sm text-slate-900 dark:text-white">{summarizeAtemState(draft.atemState, draft.atemInputId, draft.atemTransitionType) || "No switcher state yet"}</div>
                    </div>
                    <div className="rounded-2xl bg-slate-100/80 p-4 dark:bg-slate-900/80">
                      <div className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Graphics</div>
                      <div className="mt-2 text-sm text-slate-900 dark:text-white">{draft.obsSceneName || "No OBS scene yet"}</div>
                    </div>
                    <div className="rounded-2xl bg-slate-100/80 p-4 dark:bg-slate-900/80">
                      <div className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Cameras</div>
                      <div className="mt-2 text-sm text-slate-900 dark:text-white">
                        {draft.cameraId !== null && draft.presetNumber !== null ? `Camera ${draft.cameraId} · Preset ${draft.presetNumber + 1}` : "No PTZ preset yet"}
                      </div>
                    </div>
                    <div className="rounded-2xl bg-slate-100/80 p-4 dark:bg-slate-900/80">
                      <div className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Audio</div>
                      <div className="mt-2 text-sm text-slate-900 dark:text-white">{draft.mixerActions.length} mixer action(s)</div>
                    </div>
                    <div className="rounded-2xl bg-slate-100/80 p-4 dark:bg-slate-900/80">
                      <div className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Lighting</div>
                      <div className="mt-2 text-sm text-slate-900 dark:text-white">{draft.hueActions.length} lighting cue(s)</div>
                    </div>
                    <div className="rounded-2xl bg-slate-100/80 p-4 dark:bg-slate-900/80">
                      <div className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Displays</div>
                      <div className="mt-2 text-sm text-slate-900 dark:text-white">{draft.displayActions.length} display command(s)</div>
                    </div>
                  </div>
                </SectionCard>
              </TabsContent>

              <TabsContent value="switcher">
                <SectionCard
                  title="Switcher State"
                  description="Store and recall the live ATEM mix effect state instead of a single destination input."
                  icon={<Video className="h-4 w-4" />}
                  actions={
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={captureSwitcherState}>
                        Capture Live
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => updateDraft({ atemState: null, atemInputId: null })}>
                        Clear
                      </Button>
                    </div>
                  }
                >
                  {!switcherStatus?.connected ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">Connect the switcher to capture or edit live ATEM state.</p>
                  ) : (
                    <div className="space-y-5">
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <div>
                          <Label>Program Input</Label>
                          <Select
                            value={draft.atemState?.programInput ? String(draft.atemState.programInput) : "none"}
                            onValueChange={(value) =>
                              updateDraft({
                                atemState: {
                                  ...(draft.atemState || {}),
                                  programInput: value === "none" ? null : Number.parseInt(value, 10),
                                },
                                atemInputId: value === "none" ? null : Number.parseInt(value, 10),
                              })
                            }
                          >
                            <SelectTrigger className="mt-1">
                              <SelectValue placeholder="Select input" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No program change</SelectItem>
                              {(switcherStatus.inputs || []).map((input) => (
                                <SelectItem key={input.inputId} value={String(input.inputId)}>
                                  {input.shortName}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label>Preview Input</Label>
                          <Select
                            value={draft.atemState?.previewInput ? String(draft.atemState.previewInput) : "none"}
                            onValueChange={(value) =>
                              updateDraft({
                                atemState: {
                                  ...(draft.atemState || {}),
                                  previewInput: value === "none" ? null : Number.parseInt(value, 10),
                                },
                              })
                            }
                          >
                            <SelectTrigger className="mt-1">
                              <SelectValue placeholder="Select preview" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Leave preview alone</SelectItem>
                              {(switcherStatus.inputs || []).map((input) => (
                                <SelectItem key={input.inputId} value={String(input.inputId)}>
                                  {input.shortName}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label>Transition Style</Label>
                          <Select
                            value={String(draft.atemState?.transitionStyle ?? switcherStatus.transition?.nextStyle ?? 0)}
                            onValueChange={(value) =>
                              updateDraft({
                                atemState: { ...(draft.atemState || {}), transitionStyle: Number.parseInt(value, 10) },
                              })
                            }
                          >
                            <SelectTrigger className="mt-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {TRANSITION_STYLE_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={String(option.value)}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="rounded-2xl border border-slate-200 px-4 py-3 dark:border-slate-800">
                          <div className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Transition Preview</div>
                          <div className="mt-3 flex items-center justify-between">
                            <span className="text-sm text-slate-900 dark:text-white">Store preview toggle</span>
                            <Switch
                              checked={draft.atemState?.transitionPreview ?? switcherStatus.transition?.previewEnabled ?? false}
                              onCheckedChange={(checked) => updateDraft({ atemState: { ...(draft.atemState || {}), transitionPreview: checked } })}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-4 xl:grid-cols-2">
                        <div className="space-y-3">
                          <div className="text-sm font-semibold text-slate-900 dark:text-white">Downstream Keys</div>
                          {(draft.atemState?.downstreamKeyers || []).length === 0 ? (
                            <p className="text-sm text-slate-500 dark:text-slate-400">No DSK state captured yet.</p>
                          ) : (
                            (draft.atemState?.downstreamKeyers || []).map((keyer, index) => (
                              <div key={keyer.index} className="grid gap-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-800 md:grid-cols-[1fr_auto_auto_120px] md:items-center">
                                <div>
                                  <div className="font-medium text-slate-900 dark:text-white">DSK {keyer.index + 1}</div>
                                  <div className="text-sm text-slate-500 dark:text-slate-400">Stored downstream key state</div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Label className="text-xs">On Air</Label>
                                  <Switch
                                    checked={Boolean(keyer.onAir)}
                                    onCheckedChange={(checked) =>
                                      updateDraft({
                                        atemState: {
                                          ...(draft.atemState || {}),
                                          downstreamKeyers: (draft.atemState?.downstreamKeyers || []).map((entry, entryIndex) =>
                                            entryIndex === index ? { ...entry, onAir: checked } : entry,
                                          ),
                                        },
                                      })
                                    }
                                  />
                                </div>
                                <div className="flex items-center gap-2">
                                  <Label className="text-xs">Tie</Label>
                                  <Switch
                                    checked={Boolean(keyer.tie)}
                                    onCheckedChange={(checked) =>
                                      updateDraft({
                                        atemState: {
                                          ...(draft.atemState || {}),
                                          downstreamKeyers: (draft.atemState?.downstreamKeyers || []).map((entry, entryIndex) =>
                                            entryIndex === index ? { ...entry, tie: checked } : entry,
                                          ),
                                        },
                                      })
                                    }
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs">Rate</Label>
                                  <Input
                                    className="mt-1"
                                    type="number"
                                    min={1}
                                    value={keyer.rate ?? 30}
                                    onChange={(event) =>
                                      updateDraft({
                                        atemState: {
                                          ...(draft.atemState || {}),
                                          downstreamKeyers: (draft.atemState?.downstreamKeyers || []).map((entry, entryIndex) =>
                                            entryIndex === index ? { ...entry, rate: Number.parseInt(event.target.value, 10) || 30 } : entry,
                                          ),
                                        },
                                      })
                                    }
                                  />
                                </div>
                              </div>
                            ))
                          )}
                        </div>

                        <div className="space-y-3">
                          <div className="text-sm font-semibold text-slate-900 dark:text-white">Aux Outputs & Upstream Keys</div>
                          <div className="space-y-3">
                            {(draft.atemState?.auxOutputs || []).map((aux, index) => (
                              <div key={`aux-${aux.index}`} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                                <Label className="text-xs">Aux {aux.index + 1}</Label>
                                <Select
                                  value={String(aux.sourceId)}
                                  onValueChange={(value) =>
                                    updateDraft({
                                      atemState: {
                                        ...(draft.atemState || {}),
                                        auxOutputs: (draft.atemState?.auxOutputs || []).map((entry, entryIndex) =>
                                          entryIndex === index ? { ...entry, sourceId: Number.parseInt(value, 10) } : entry,
                                        ),
                                      },
                                    })
                                  }
                                >
                                  <SelectTrigger className="mt-1">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {(switcherStatus.inputs || []).map((input) => (
                                      <SelectItem key={input.inputId} value={String(input.inputId)}>
                                        {input.shortName}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            ))}

                            {(draft.atemState?.upstreamKeyers || []).map((keyer, index) => (
                              <div key={`usk-${keyer.index}`} className="flex items-center justify-between rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                                <div>
                                  <div className="font-medium text-slate-900 dark:text-white">USK {keyer.index + 1}</div>
                                  <div className="text-sm text-slate-500 dark:text-slate-400">Store on-air state</div>
                                </div>
                                <Switch
                                  checked={Boolean(keyer.onAir)}
                                  onCheckedChange={(checked) =>
                                    updateDraft({
                                      atemState: {
                                        ...(draft.atemState || {}),
                                        upstreamKeyers: (draft.atemState?.upstreamKeyers || []).map((entry, entryIndex) =>
                                          entryIndex === index ? { ...entry, onAir: checked } : entry,
                                        ),
                                      },
                                    })
                                  }
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </SectionCard>
              </TabsContent>

              <TabsContent value="graphics">
                <SectionCard
                  title="OBS Graphics State"
                  description="Recall the current OBS program scene as part of the broadcast scene."
                  icon={<Radio className="h-4 w-4" />}
                  actions={
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={captureObsState}>
                        Capture Live
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => updateDraft({ obsSceneName: "" })}>
                        Clear
                      </Button>
                    </div>
                  }
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label>OBS Program Scene</Label>
                      <Select value={draft.obsSceneName || "none"} onValueChange={(value) => updateDraft({ obsSceneName: value === "none" ? "" : value })}>
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Select scene" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No OBS action</SelectItem>
                          {obsSceneNames.map((sceneName) => (
                            <SelectItem key={sceneName} value={sceneName}>
                              {sceneName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="rounded-2xl border border-slate-200 px-4 py-3 dark:border-slate-800">
                      <div className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Live OBS</div>
                      <div className="mt-2 text-sm text-slate-900 dark:text-white">
                        {obsScenesResult?.state?.currentProgramScene || obsConnection?.currentProgramScene || "Not connected"}
                      </div>
                    </div>
                  </div>
                </SectionCard>
              </TabsContent>

              <TabsContent value="cameras">
                <SectionCard
                  title="PTZ Camera Preset"
                  description="Pair this scene with one saved PTZ preset for a fast, deterministic camera move."
                  icon={<Video className="h-4 w-4" />}
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label>Camera</Label>
                      <Select
                        value={draft.cameraId !== null ? String(draft.cameraId) : "none"}
                        onValueChange={(value) => updateDraft({ cameraId: value === "none" ? null : Number.parseInt(value, 10), presetNumber: null })}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No PTZ action</SelectItem>
                          {cameras.map((camera) => (
                            <SelectItem key={camera.id} value={String(camera.id)}>
                              {camera.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Preset</Label>
                      <Select
                        value={draft.presetNumber !== null ? String(draft.presetNumber) : "none"}
                        onValueChange={(value) => updateDraft({ presetNumber: value === "none" ? null : Number.parseInt(value, 10) })}
                        disabled={draft.cameraId === null}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Select preset" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No preset</SelectItem>
                          {Array.from({ length: 16 }, (_, index) => {
                            const preset = selectedCameraPresets.find((entry) => entry.presetNumber === index);
                            return (
                              <SelectItem key={index} value={String(index)}>
                                {preset?.name || `Preset ${index + 1}`}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </SectionCard>
              </TabsContent>

              <TabsContent value="audio">
                <SectionCard
                  title="Mixer Actions"
                  description="Capture the live X32 state or hand-author the channels this scene should own."
                  icon={<SlidersHorizontal className="h-4 w-4" />}
                  actions={
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={captureMixerState}>
                        Capture Live Mix
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          updateDraft({
                            mixerActions: [...draft.mixerActions, { section: "ch", channel: 1, fader: 0.75, muted: false }],
                          })
                        }
                      >
                        Add Channel
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => updateDraft({ mixerActions: [] })}>
                        Clear
                      </Button>
                    </div>
                  }
                >
                  {draft.mixerActions.length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">No mixer state stored for this scene yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {draft.mixerActions.map((action, index) => (
                        <MixerActionEditor
                          key={`${action.section}-${action.channel}-${index}`}
                          action={action}
                          onUpdate={(updates) =>
                            updateDraft({
                              mixerActions: draft.mixerActions.map((entry, entryIndex) =>
                                entryIndex === index ? { ...entry, ...updates } : entry,
                              ),
                            })
                          }
                          onRemove={() =>
                            updateDraft({
                              mixerActions: draft.mixerActions.filter((_, entryIndex) => entryIndex !== index),
                            })
                          }
                        />
                      ))}
                    </div>
                  )}
                </SectionCard>
              </TabsContent>

              <TabsContent value="lighting">
                <SectionCard
                  title="Lighting Cues"
                  description="Use saved Hue scenes, live room states, or individual light levels as part of the scene recall."
                  icon={<Lightbulb className="h-4 w-4" />}
                  actions={
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={captureLightingState}>
                        Capture Live Rooms
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          updateDraft({
                            hueActions: [...draft.hueActions, { type: "scene", bridgeId: hueBridges[0]?.id || 0, sceneId: undefined }],
                          })
                        }
                      >
                        Add Cue
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => updateDraft({ hueActions: [] })}>
                        Clear
                      </Button>
                    </div>
                  }
                >
                  {draft.hueActions.length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">No lighting cues stored for this scene yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {draft.hueActions.map((action, index) => (
                        <HueActionRow
                          key={`${action.type}-${action.bridgeId}-${index}`}
                          action={action}
                          bridges={hueBridges}
                          onUpdate={(updates) =>
                            updateDraft({
                              hueActions: draft.hueActions.map((entry, entryIndex) =>
                                entryIndex === index ? { ...entry, ...updates } : entry,
                              ),
                            })
                          }
                          onRemove={() =>
                            updateDraft({
                              hueActions: draft.hueActions.filter((_, entryIndex) => entryIndex !== index),
                            })
                          }
                        />
                      ))}
                    </div>
                  )}
                </SectionCard>
              </TabsContent>

              <TabsContent value="displays">
                <SectionCard
                  title="Display Commands"
                  description="Bundle TVs and signage into the same recall action so the room state follows the shot."
                  icon={<Monitor className="h-4 w-4" />}
                  actions={
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={captureDisplayState}>
                        Capture Live State
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          updateDraft({
                            displayActions: [...draft.displayActions, { displayId: displays[0]?.id || 0, command: "power_on" }],
                          })
                        }
                      >
                        Add Command
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => updateDraft({ displayActions: [] })}>
                        Clear
                      </Button>
                    </div>
                  }
                >
                  {draft.displayActions.length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">No display commands stored for this scene yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {draft.displayActions.map((action, index) => (
                        <DisplayActionRow
                          key={`${action.displayId}-${action.command}-${index}`}
                          action={action}
                          displays={displays}
                          onUpdate={(updates) =>
                            updateDraft({
                              displayActions: draft.displayActions.map((entry, entryIndex) =>
                                entryIndex === index ? { ...entry, ...updates } : entry,
                              ),
                            })
                          }
                          onRemove={() =>
                            updateDraft({
                              displayActions: draft.displayActions.filter((_, entryIndex) => entryIndex !== index),
                            })
                          }
                        />
                      ))}
                    </div>
                  )}
                </SectionCard>
              </TabsContent>
            </Tabs>
          </section>
        </div>
      </main>
    </AppLayout>
  );
}
