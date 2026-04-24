import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Plus, Radio, Repeat, Play, LogOut, Trash2, Wifi } from "lucide-react";
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
  onRefreshScenes: () => void;
}) {
  const connected = Boolean(status?.connected || connection?.status === "online");
  const currentScene = status?.currentProgramScene || connection?.currentProgramScene;
  const sceneNames = scenes.map((scene) => scene.sceneName);
  const selectableSceneNames = selectedSceneName && !sceneNames.includes(selectedSceneName)
    ? [selectedSceneName, ...sceneNames]
    : sceneNames;

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
