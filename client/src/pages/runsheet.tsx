import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sceneButtonApi, runsheetApi, type RunsheetCueWithScene } from "@/lib/api";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, GripVertical, ListChecks, Play, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { SceneButton } from "@shared/schema";

function moveId(ids: number[], fromId: number, toId: number) {
  const fromIndex = ids.indexOf(fromId);
  const toIndex = ids.indexOf(toId);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return ids;
  const next = [...ids];
  const [removed] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, removed);
  return next;
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function sceneLabel(scene: SceneButton) {
  const group = scene.groupName?.trim();
  return `${group && group !== "General" ? `${group} / ` : ""}${scene.name}`;
}

function CueRow({
  cue,
  index,
  active,
  onActivate,
  onDragStart,
  onDrop,
  onMove,
  onRun,
  onNotes,
  onDelete,
}: {
  cue: RunsheetCueWithScene;
  index: number;
  active: boolean;
  onActivate: () => void;
  onDragStart: () => void;
  onDrop: () => void;
  onMove: (direction: -1 | 1) => void;
  onRun: () => void;
  onNotes: (notes: string) => void;
  onDelete: () => void;
}) {
  const scene = cue.scene;
  const [notes, setNotes] = useState(cue.notes || "");

  useEffect(() => {
    setNotes(cue.notes || "");
  }, [cue.notes]);

  return (
    <div
      id={`runsheet-cue-${cue.id}`}
      draggable
      onDragStart={onDragStart}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        onDrop();
      }}
      onClick={onActivate}
      className={cn(
        "grid grid-cols-[44px_1fr_2fr_190px] gap-3 items-stretch rounded-lg border bg-slate-300/40 dark:bg-slate-900/50 p-3 transition-colors",
        active ? "border-cyan-400 shadow-[0_0_0_1px_rgba(34,211,238,0.4)]" : "border-slate-400/30 dark:border-slate-800"
      )}
      data-testid={`runsheet-cue-${cue.id}`}
    >
      <div className="flex flex-col items-center justify-center gap-2">
        <GripVertical className="w-4 h-4 text-slate-500 cursor-grab" />
        <span className={cn("w-7 h-7 rounded flex items-center justify-center text-xs font-mono", active ? "bg-cyan-500 text-slate-950" : "bg-slate-200 dark:bg-slate-800 text-slate-500")}>
          {index + 1}
        </span>
      </div>

      <div className="min-w-0 flex flex-col justify-center gap-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-3 h-3 rounded" style={{ backgroundColor: scene?.color || "#64748b" }} />
          <h3 className="font-semibold truncate">{scene ? sceneLabel(scene) : "Missing scene"}</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          {scene ? `Scene ${scene.buttonNumber}` : "This scene may have been deleted"}
          {active ? " · Current cue" : ""}
        </p>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Notes</Label>
        <Textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          onBlur={() => onNotes(notes)}
          placeholder="Operator note, timing, camera framing..."
          className="min-h-[68px] resize-none"
          data-testid={`textarea-runsheet-notes-${cue.id}`}
        />
      </div>

      <div className="flex flex-col justify-between gap-2">
        <Button size="sm" onClick={(event) => { event.stopPropagation(); onRun(); }} disabled={!scene} data-testid={`button-run-cue-${cue.id}`}>
          <Play className="w-3 h-3 mr-1" /> Run Scene
        </Button>
        <div className="grid grid-cols-3 gap-2">
          <Button size="sm" variant="outline" onClick={(event) => { event.stopPropagation(); onMove(-1); }} data-testid={`button-cue-up-${cue.id}`}>
            <ArrowUp className="w-3 h-3" />
          </Button>
          <Button size="sm" variant="outline" onClick={(event) => { event.stopPropagation(); onMove(1); }} data-testid={`button-cue-down-${cue.id}`}>
            <ArrowDown className="w-3 h-3" />
          </Button>
          <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-600" onClick={(event) => { event.stopPropagation(); onDelete(); }} data-testid={`button-delete-cue-${cue.id}`}>
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function RunsheetPage() {
  const queryClient = useQueryClient();
  const [selectedSceneId, setSelectedSceneId] = useState("");
  const [activeCueId, setActiveCueId] = useState<number | null>(() => {
    const saved = localStorage.getItem("ptzcommand:runsheet-active-cue");
    return saved ? parseInt(saved, 10) : null;
  });
  const [dragCueId, setDragCueId] = useState<number | null>(null);

  const { data: scenes = [] } = useQuery<SceneButton[]>({
    queryKey: ["scene-buttons"],
    queryFn: sceneButtonApi.getAll,
  });

  const { data: cues = [] } = useQuery<RunsheetCueWithScene[]>({
    queryKey: ["runsheet-cues"],
    queryFn: runsheetApi.getAll,
  });

  const sortedScenes = useMemo(() => [...scenes].sort((a, b) => a.buttonNumber - b.buttonNumber), [scenes]);
  const activeIndex = activeCueId ? cues.findIndex((cue) => cue.id === activeCueId) : -1;

  useEffect(() => {
    if (activeCueId) localStorage.setItem("ptzcommand:runsheet-active-cue", String(activeCueId));
    else localStorage.removeItem("ptzcommand:runsheet-active-cue");
  }, [activeCueId]);

  function selectCue(id: number | null) {
    setActiveCueId(id);
    if (id) setTimeout(() => document.getElementById(`runsheet-cue-${id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 0);
  }

  function stepCue(direction: 1 | -1) {
    if (cues.length === 0) return;
    const nextIndex = activeIndex < 0
      ? direction > 0 ? 0 : cues.length - 1
      : Math.max(0, Math.min(cues.length - 1, activeIndex + direction));
    selectCue(cues[nextIndex].id);
  }

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.code !== "Space" || isEditableTarget(event.target)) return;
      event.preventDefault();
      stepCue(event.shiftKey ? -1 : 1);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [activeIndex, cues]);

  const addMutation = useMutation({
    mutationFn: () => runsheetApi.create({ sceneButtonId: parseInt(selectedSceneId, 10), sortOrder: cues.length, notes: null }),
    onSuccess: (cue) => {
      queryClient.invalidateQueries({ queryKey: ["runsheet-cues"] });
      setSelectedSceneId("");
      selectCue(cue.id);
      toast.success("Cue added");
    },
    onError: (error: Error) => toast.error("Add cue failed", { description: error.message }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: { notes?: string } }) => runsheetApi.update(id, updates),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["runsheet-cues"] }),
    onError: (error: Error) => toast.error("Cue update failed", { description: error.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => runsheetApi.delete(id),
    onSuccess: (_result, id) => {
      queryClient.invalidateQueries({ queryKey: ["runsheet-cues"] });
      if (activeCueId === id) selectCue(null);
      toast.success("Cue removed");
    },
    onError: (error: Error) => toast.error("Remove cue failed", { description: error.message }),
  });

  const reorderMutation = useMutation({
    mutationFn: (ids: number[]) => runsheetApi.reorder(ids),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["runsheet-cues"] }),
    onError: (error: Error) => toast.error("Reorder failed", { description: error.message }),
  });

  const runMutation = useMutation({
    mutationFn: (sceneId: number) => sceneButtonApi.execute(sceneId),
    onSuccess: (result) => toast.success("Scene executed", { description: result.results?.join(" · ") }),
    onError: (error: Error) => toast.error("Scene failed", { description: error.message }),
  });

  function reorder(nextIds: number[]) {
    reorderMutation.mutate(nextIds);
  }

  function moveCue(id: number, direction: -1 | 1) {
    const ids = cues.map((cue) => cue.id);
    const index = ids.indexOf(id);
    const target = ids[index + direction];
    if (!target) return;
    reorder(moveId(ids, id, target));
  }

  return (
    <AppLayout activePage="/runsheet">
      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <ListChecks className="w-5 h-5 text-cyan-500" /> Runsheet
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Build a cue-by-cue cut sheet from saved scenes. Space advances the current cue, Shift+Space moves back.
              </p>
            </div>
            <div className="rounded-md border border-slate-400/30 dark:border-slate-800 px-3 py-2 text-xs text-muted-foreground">
              Current: {activeIndex >= 0 ? `${activeIndex + 1} / ${cues.length}` : cues.length ? "not set" : "empty"}
            </div>
          </div>

          <div className="rounded-lg border border-slate-400/30 dark:border-slate-800 bg-slate-300/40 dark:bg-slate-900/50 p-4">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
              <div className="space-y-1">
                <Label>Add Scene Cue</Label>
                <Select value={selectedSceneId} onValueChange={setSelectedSceneId}>
                  <SelectTrigger data-testid="select-runsheet-scene"><SelectValue placeholder="Choose a saved scene" /></SelectTrigger>
                  <SelectContent>
                    {sortedScenes.map((scene) => (
                      <SelectItem key={scene.id} value={scene.id.toString()}>{sceneLabel(scene)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={() => addMutation.mutate()} disabled={addMutation.isPending || !selectedSceneId} data-testid="button-add-runsheet-cue">
                <Plus className="w-4 h-4 mr-2" /> Add Cue
              </Button>
            </div>
          </div>

          {cues.length === 0 ? (
            <div className="rounded-lg border-2 border-dashed border-slate-400/40 dark:border-slate-800 p-12 text-center">
              <ListChecks className="w-10 h-10 mx-auto text-slate-500 mb-3" />
              <p className="text-sm text-muted-foreground">No cues yet. Add saved scenes to build the run.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {cues.map((cue, index) => (
                <CueRow
                  key={cue.id}
                  cue={cue}
                  index={index}
                  active={cue.id === activeCueId}
                  onActivate={() => selectCue(cue.id)}
                  onDragStart={() => setDragCueId(cue.id)}
                  onDrop={() => {
                    if (!dragCueId) return;
                    reorder(moveId(cues.map((item) => item.id), dragCueId, cue.id));
                    setDragCueId(null);
                  }}
                  onMove={(direction) => moveCue(cue.id, direction)}
                  onRun={() => {
                    if (!cue.scene) return;
                    selectCue(cue.id);
                    runMutation.mutate(cue.scene.id);
                  }}
                  onNotes={(notes) => {
                    if (notes !== (cue.notes || "")) updateMutation.mutate({ id: cue.id, updates: { notes } });
                  }}
                  onDelete={() => deleteMutation.mutate(cue.id)}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </AppLayout>
  );
}
