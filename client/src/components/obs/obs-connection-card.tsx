import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { CircleDot, Pause, Plus, Radio, Repeat, Play, LogOut, Square, Trash2, Wifi } from "lucide-react";
import type { ObsConnection } from "@shared/schema";
import type { ObsScene, ObsState } from "@/lib/api";

export function OBSConnectionCard({
  connection,
  status,
  scenes,
  selectedSceneName,
  onSelectedSceneNameChange,
  addOpen,
  onAddOpenChange,
  newObs,
  onNewObsChange,
  onCreate,
  creating,
  onConnect,
  connecting,
  onDisconnect,
  disconnecting,
  onDelete,
  deleting,
  onSwitchScene,
  switching,
  onStartRecording,
  onStopRecording,
  onPauseRecording,
  onResumeRecording,
  recordingPending,
  onRefreshScenes,
}: {
  connection: ObsConnection | null;
  status?: ObsState;
  scenes: ObsScene[];
  selectedSceneName: string;
  onSelectedSceneNameChange: (sceneName: string) => void;
  addOpen: boolean;
  onAddOpenChange: (open: boolean) => void;
  newObs: { name: string; host: string; port: number; password: string };
  onNewObsChange: (value: { name: string; host: string; port: number; password: string }) => void;
  onCreate: () => void;
  creating: boolean;
  onConnect: () => void;
  connecting: boolean;
  onDisconnect: () => void;
  disconnecting: boolean;
  onDelete: () => void;
  deleting: boolean;
  onSwitchScene: () => void;
  switching: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onPauseRecording: () => void;
  onResumeRecording: () => void;
  recordingPending: boolean;
  onRefreshScenes: () => void;
}) {
  const connected = Boolean(status?.connected || connection?.status === "online");
  const liveRecordingStatus = Boolean(status?.connected);
  const currentScene = status?.currentProgramScene || connection?.currentProgramScene;
  const sceneNames = scenes.map((scene) => scene.sceneName);
  const selectableSceneNames = selectedSceneName && !sceneNames.includes(selectedSceneName)
    ? [selectedSceneName, ...sceneNames]
    : sceneNames;
  const recordingActive = Boolean(status?.recordingActive);
  const recordingPaused = Boolean(status?.recordingPaused);
  const recordingLabel = !liveRecordingStatus
    ? "Unknown"
    : recordingPaused
      ? "Paused"
      : recordingActive
        ? "Recording"
        : "Standby";
  const recordingClass = recordingPaused
    ? "bg-amber-500/10 text-amber-600 dark:text-amber-300"
    : recordingActive
      ? "bg-red-500/10 text-red-600 dark:text-red-300"
      : liveRecordingStatus
        ? "bg-slate-500/10 text-slate-600 dark:text-slate-300"
        : "bg-slate-500/10 text-slate-500 dark:text-slate-400";
  const canStartRecording = liveRecordingStatus && !recordingActive && !recordingPending;
  const canStopRecording = liveRecordingStatus && recordingActive && !recordingPending;
  const canPauseRecording = liveRecordingStatus && recordingActive && !recordingPaused && !recordingPending;
  const canResumeRecording = liveRecordingStatus && recordingActive && recordingPaused && !recordingPending;

  return (
    <div className="bg-slate-300/80 dark:bg-slate-900/80 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-3" data-testid="obs-websocket-controller">
      <div className="grid gap-4 lg:grid-cols-[minmax(260px,340px)_minmax(0,1fr)] lg:items-start">
        <div className="min-w-0 flex items-start gap-3">
          <div className={cn("mt-0.5 w-10 h-10 shrink-0 rounded-lg border flex items-center justify-center", connected ? "border-green-500/50 bg-green-500/10" : "border-slate-500/40 bg-slate-500/10")}>
            <Radio className={cn("h-5 w-5", connected ? "text-green-500" : "text-slate-500")} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-slate-900 dark:text-white">OBS WebSocket</h3>
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em]",
                  connected
                    ? "bg-green-500/10 text-green-600 dark:text-green-400"
                    : "bg-slate-500/10 text-slate-500 dark:text-slate-400",
                )}
              >
                {connected ? "Online" : "Offline"}
              </span>
            </div>
            <p className="truncate text-sm text-slate-500 dark:text-slate-400">
              {connection
                ? `${connection.name} · ${connection.host}:${connection.port}`
                : "Switch OBS program scenes from PTZ Command scenes."}
            </p>
            {connection && (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
                {connected ? `Connected${currentScene ? ` · live: ${currentScene}` : ""}` : status?.error || "Offline"}
              </p>
            )}
          </div>
        </div>

        {!connection ? (
          <Dialog open={addOpen} onOpenChange={onAddOpenChange}>
            <DialogTrigger asChild>
              <Button className="w-full lg:w-auto lg:justify-self-end" data-testid="button-add-obs">
                <Plus className="h-4 w-4 mr-2" /> Add OBS
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-slate-300 dark:bg-slate-900 border-slate-300 dark:border-slate-700">
              <DialogHeader><DialogTitle>Add OBS Studio</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Name</Label>
                  <Input value={newObs.name} onChange={(e) => onNewObsChange({ ...newObs, name: e.target.value })} data-testid="input-obs-name" />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <Label>Host</Label>
                    <Input value={newObs.host} onChange={(e) => onNewObsChange({ ...newObs, host: e.target.value })} placeholder="127.0.0.1" data-testid="input-obs-host" />
                  </div>
                  <div>
                    <Label>Port</Label>
                    <Input type="number" min={1} max={65535} value={newObs.port} onChange={(e) => onNewObsChange({ ...newObs, port: parseInt(e.target.value) || 4455 })} data-testid="input-obs-port" />
                  </div>
                </div>
                <div>
                  <Label>Password</Label>
                  <Input type="password" value={newObs.password} onChange={(e) => onNewObsChange({ ...newObs, password: e.target.value })} placeholder="Optional" data-testid="input-obs-password" />
                </div>
                <Button className="w-full" onClick={onCreate} disabled={!newObs.host || creating} data-testid="button-save-obs">
                  {creating ? "Adding..." : "Add OBS"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        ) : (
          <div className="grid gap-2">
            {connected ? (
              <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto]">
                {selectableSceneNames.length > 0 ? (
                  <>
                    <Select
                      value={selectedSceneName || undefined}
                      onValueChange={onSelectedSceneNameChange}
                    >
                      <SelectTrigger className="w-full min-w-0" data-testid="select-switcher-obs-scene">
                        <SelectValue placeholder="OBS scene" />
                      </SelectTrigger>
                      <SelectContent>
                        {selectableSceneNames.map((sceneName) => (
                          <SelectItem key={sceneName} value={sceneName}>
                            {sceneName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="outline" className="w-full md:w-auto" onClick={onSwitchScene} disabled={!selectedSceneName || switching} data-testid="button-switch-obs-scene">
                      <Play className="h-4 w-4 mr-2" /> Go
                    </Button>
                    <Button variant="outline" className="w-full md:w-auto" onClick={onRefreshScenes} data-testid="button-refresh-obs-scenes">
                      <Repeat className="h-4 w-4 mr-2" /> Refresh
                    </Button>
                  </>
                ) : (
                  <Button variant="outline" disabled className="w-full justify-start text-slate-500">
                    No OBS scenes found
                  </Button>
                )}
              </div>
            ) : null}
            {connection && (
              <div className="rounded-md border border-slate-400/30 dark:border-slate-800 bg-slate-200/50 dark:bg-slate-950/50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em]", recordingClass)}>
                        <CircleDot className="mr-1 h-3 w-3" />
                        {recordingLabel}
                      </span>
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">Recording</span>
                    </div>
                    <p className="mt-1 break-all text-xs text-slate-500 dark:text-slate-400">
                      {status?.recordingTimecode
                        ? `Timecode ${status.recordingTimecode}`
                        : status?.recordingOutputPath
                          ? `Last file: ${status.recordingOutputPath}`
                          : liveRecordingStatus
                            ? "OBS recording output is ready"
                            : "Connect OBS to read recording state"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {!recordingActive && (
                      <Button size="sm" variant="outline" onClick={onStartRecording} disabled={!canStartRecording} data-testid="button-start-obs-recording">
                        <CircleDot className="h-4 w-4 mr-2" /> Start Recording
                      </Button>
                    )}
                    {recordingActive && !recordingPaused && (
                      <Button size="sm" variant="outline" onClick={onPauseRecording} disabled={!canPauseRecording} data-testid="button-pause-obs-recording">
                        <Pause className="h-4 w-4 mr-2" /> Pause
                      </Button>
                    )}
                    {recordingActive && recordingPaused && (
                      <Button size="sm" variant="outline" onClick={onResumeRecording} disabled={!canResumeRecording} data-testid="button-resume-obs-recording">
                        <Play className="h-4 w-4 mr-2" /> Resume
                      </Button>
                    )}
                    {recordingActive && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="destructive" disabled={!canStopRecording} data-testid="button-stop-obs-recording">
                            <Square className="h-4 w-4 mr-2" /> Stop Recording
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Stop OBS recording?</AlertDialogTitle>
                            <AlertDialogDescription>
                              OBS will stop writing the current recording file. This cannot be undone from PTZ Command.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={onStopRecording} className="bg-red-600 text-white hover:bg-red-700">
                              Stop Recording
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              {connected ? (
                <Button variant="outline" className="w-full sm:w-auto" onClick={onDisconnect} disabled={disconnecting} data-testid="button-disconnect-obs">
                  <LogOut className="h-4 w-4 mr-2" /> Disconnect
                </Button>
              ) : (
                <Button variant="outline" className="w-full sm:w-auto" onClick={onConnect} disabled={connecting} data-testid="button-connect-obs">
                  <Wifi className="h-4 w-4 mr-2" /> {connecting ? "Connecting..." : "Connect"}
                </Button>
              )}
              <Button variant="ghost" className="w-full sm:w-auto text-red-500 hover:text-red-400" onClick={onDelete} disabled={deleting} data-testid="button-delete-obs">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
