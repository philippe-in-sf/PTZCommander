import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { switcherApi } from "@/lib/api";
import { useAtemControl, type AtemState } from "@/hooks/use-atem-control";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { MonitorPlay, Plus, Wifi, WifiOff, Zap, ArrowRightLeft, Settings, Trash2, AlertTriangle, Square, SkipForward, Repeat, Play } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AppLayout } from "@/components/app-layout";
import type { Switcher } from "@shared/schema";

type SwitcherTab = "me" | "transition" | "keyers" | "dsk" | "macros";

const SWITCHER_TABS: { key: SwitcherTab; label: string }[] = [
  { key: "me", label: "Program / Preview" },
  { key: "transition", label: "Transitions" },
  { key: "keyers", label: "Upstream Keys" },
  { key: "dsk", label: "Downstream Keys" },
  { key: "macros", label: "Macros" },
];

const TRANSITION_STYLES = [
  { value: 0, label: "MIX" },
  { value: 1, label: "DIP" },
  { value: 2, label: "WIPE" },
  { value: 3, label: "DVE" },
  { value: 4, label: "STING" },
];

const KEY_TYPES: Record<number, string> = {
  0: "Luma",
  1: "Chroma",
  2: "Pattern",
  3: "DVE",
};

export default function SwitcherPage() {
  const queryClient = useQueryClient();
  const { atemState, switcher, switchers, send, cut, auto, setProgramInput, setPreviewInput, getInputLabel, displayInputs } = useAtemControl();
  const controlTimedOut = switcher?.status === "control-timeout";
  const [activeTab, setActiveTab] = useState<SwitcherTab>("me");
  const [addSwitcherOpen, setAddSwitcherOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [newSwitcher, setNewSwitcher] = useState({ name: "ATEM Extreme", ip: "", type: "atem" });

  const createSwitcherMutation = useMutation({
    mutationFn: switcherApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["switchers"] });
      setAddSwitcherOpen(false);
      setNewSwitcher({ name: "ATEM Extreme", ip: "", type: "atem" });
      toast.success("ATEM switcher added");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const connectSwitcherMutation = useMutation({
    mutationFn: switcherApi.connect,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["switchers"] });
      if (data.success) toast.success("Connected to ATEM");
      else toast.error(data.message || "ATEM control handshake timed out");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteSwitcherMutation = useMutation({
    mutationFn: switcherApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["switchers"] });
      setEditOpen(false);
      setDeleteConfirm(false);
      toast.success("Switcher removed");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const switcherHeaderRight = switcher ? (
    <div className="flex items-center gap-2">
      <span className="text-sm text-slate-500 dark:text-slate-400">{switcher.name}</span>
      {atemState.connected ? (
        <Wifi className="h-4 w-4 text-green-500" />
      ) : (
        <Button variant="ghost" size="sm" onClick={() => connectSwitcherMutation.mutate(switcher.id)} className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white" data-testid="button-connect-switcher-full">
          <WifiOff className="h-4 w-4 mr-1" /> Connect
        </Button>
      )}
      <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)} className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white p-1.5" data-testid="button-edit-switcher">
        <Settings className="h-4 w-4" />
      </Button>
    </div>
  ) : null;

  return (
    <AppLayout activePage="/switcher" headerRight={switcherHeaderRight}>
      {!switcher ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <MonitorPlay className="h-16 w-16 mx-auto text-slate-400 dark:text-slate-600" />
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">No Switcher Configured</h2>
            <p className="text-slate-500 dark:text-slate-400">Add your Blackmagic ATEM to get started</p>
            <Dialog open={addSwitcherOpen} onOpenChange={setAddSwitcherOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-switcher-full">
                  <Plus className="h-4 w-4 mr-2" /> Add ATEM Switcher
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-slate-300 dark:bg-slate-900 border-slate-300 dark:border-slate-700">
                <DialogHeader><DialogTitle>Add ATEM Switcher</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="sw-name">Name</Label>
                    <Input id="sw-name" value={newSwitcher.name} onChange={(e) => setNewSwitcher({ ...newSwitcher, name: e.target.value })} placeholder="ATEM Extreme" className="bg-slate-300 dark:bg-slate-800 border-slate-300 dark:border-slate-600" data-testid="input-switcher-name-full" />
                  </div>
                  <div>
                    <Label htmlFor="sw-ip">IP Address</Label>
                    <Input id="sw-ip" value={newSwitcher.ip} onChange={(e) => setNewSwitcher({ ...newSwitcher, ip: e.target.value })} placeholder="192.168.1.100" className="bg-slate-300 dark:bg-slate-800 border-slate-300 dark:border-slate-600" data-testid="input-switcher-ip-full" />
                  </div>
                  <Button className="w-full" onClick={() => createSwitcherMutation.mutate(newSwitcher)} disabled={!newSwitcher.ip || createSwitcherMutation.isPending} data-testid="button-save-switcher-full">
                    {createSwitcherMutation.isPending ? "Adding..." : "Add Switcher"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      ) : !atemState.connected ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <WifiOff className="h-16 w-16 mx-auto text-slate-400 dark:text-slate-600" />
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
              {controlTimedOut ? "ATEM Control Timed Out" : "Switcher Not Connected"}
            </h2>
            <p className="text-slate-500 dark:text-slate-400">
              {controlTimedOut
                ? `${switcher.name} may be online, but the ATEM control session did not answer.`
                : `Click Connect to establish connection to ${switcher.name}`}
            </p>
            <Button onClick={() => connectSwitcherMutation.mutate(switcher.id)} disabled={connectSwitcherMutation.isPending} data-testid="button-connect-switcher-big">
              <Wifi className="h-4 w-4 mr-2" />
              {connectSwitcherMutation.isPending ? "Connecting..." : "Connect"}
            </Button>
          </div>
        </div>
      ) : (
        <main className="flex-1 p-6 flex flex-col gap-4 max-w-7xl mx-auto w-full">
          <div className="flex gap-2 border-b border-slate-300 dark:border-slate-800 pb-2">
            {SWITCHER_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "px-4 py-2 rounded-t text-sm font-medium transition-colors",
                  activeTab === tab.key
                    ? "text-slate-900 dark:text-white bg-slate-200 dark:bg-slate-800 border border-b-0 border-slate-300 dark:border-slate-700"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/50 dark:hover:bg-slate-800/50"
                )}
                data-testid={`tab-${tab.key}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === "me" && <MESection state={atemState} send={send} displayInputs={displayInputs} getInputLabel={getInputLabel} />}
          {activeTab === "transition" && <TransitionSection state={atemState} send={send} />}
          {activeTab === "keyers" && <USKSection state={atemState} send={send} getInputLabel={getInputLabel} />}
          {activeTab === "dsk" && <DSKSection state={atemState} send={send} />}
          {activeTab === "macros" && <MacroSection state={atemState} send={send} />}
        </main>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="bg-slate-300 dark:bg-slate-900 border-slate-300 dark:border-slate-700">
          <DialogHeader><DialogTitle>Switcher Settings</DialogTitle></DialogHeader>
          {switcher && (
            <div className="space-y-4">
              <div><Label>Name</Label><div className="text-slate-900 dark:text-white">{switcher.name}</div></div>
              <div><Label>IP Address</Label><div className="text-slate-900 dark:text-white font-mono">{switcher.ip}</div></div>
              <div><Label>Status</Label><div className={atemState.connected ? "text-green-400" : "text-red-400"}>{atemState.connected ? "Connected" : "Disconnected"}</div></div>
              <div className="border-t border-slate-300 dark:border-slate-700 pt-4">
                {!deleteConfirm ? (
                  <Button variant="destructive" className="w-full" onClick={() => setDeleteConfirm(true)} data-testid="button-delete-switcher">
                    <Trash2 className="h-4 w-4 mr-2" /> Remove Switcher
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-amber-400 text-sm"><AlertTriangle className="h-4 w-4" /> Are you sure?</div>
                    <div className="flex gap-2">
                      <Button variant="outline" className="flex-1" onClick={() => setDeleteConfirm(false)} data-testid="button-cancel-delete-switcher">Cancel</Button>
                      <Button variant="destructive" className="flex-1" onClick={() => switcher && deleteSwitcherMutation.mutate(switcher.id)} disabled={deleteSwitcherMutation.isPending} data-testid="button-confirm-delete-switcher">
                        {deleteSwitcherMutation.isPending ? "Deleting..." : "Delete"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

function MESection({ state, send, displayInputs, getInputLabel }: { state: AtemState; send: (msg: any) => void; displayInputs: AtemState["inputs"]; getInputLabel: (id: number) => string }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-300/80 dark:bg-slate-900/80 border border-slate-300 dark:border-slate-700 rounded-lg p-5">
          <div className="text-xs font-mono text-green-400 mb-3 tracking-widest">PREVIEW</div>
          <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-4 xl:grid-cols-5 gap-2">
            {displayInputs.map((input) => (
              <Button
                key={input.inputId}
                variant="outline"
                onClick={() => send({ type: "atem_preview", inputId: input.inputId })}
                className={cn(
                  "h-14 font-mono text-sm flex flex-col gap-0.5",
                  state.previewInput === input.inputId && "bg-green-600 border-green-500 text-white hover:bg-green-700"
                )}
                data-testid={`button-preview-${input.inputId}`}
              >
                <span className="text-base font-bold">{input.inputId}</span>
                <span className="text-[9px] opacity-70 truncate w-full text-center">{input.shortName}</span>
              </Button>
            ))}
          </div>
        </div>

        <div className="bg-slate-300/80 dark:bg-slate-900/80 border border-slate-300 dark:border-slate-700 rounded-lg p-5">
          <div className="text-xs font-mono text-red-400 mb-3 tracking-widest">PROGRAM</div>
          <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-4 xl:grid-cols-5 gap-2">
            {displayInputs.map((input) => (
              <Button
                key={input.inputId}
                variant="outline"
                onClick={() => send({ type: "atem_program", inputId: input.inputId })}
                className={cn(
                  "h-14 font-mono text-sm flex flex-col gap-0.5",
                  state.programInput === input.inputId && "bg-red-600 border-red-500 text-white hover:bg-red-700"
                )}
                data-testid={`button-program-${input.inputId}`}
              >
                <span className="text-base font-bold">{input.inputId}</span>
                <span className="text-[9px] opacity-70 truncate w-full text-center">{input.shortName}</span>
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <Button
          variant="outline"
          className={cn("flex-1 h-16 text-xl font-bold", state.inTransition && "animate-pulse")}
          onClick={() => send({ type: "atem_cut" })}
          data-testid="button-cut"
        >
          <Zap className="h-6 w-6 mr-2" /> CUT
        </Button>
        <Button
          variant="outline"
          className={cn("flex-1 h-16 text-xl font-bold", state.inTransition && "bg-amber-600 border-amber-500")}
          onClick={() => send({ type: "atem_auto" })}
          data-testid="button-auto"
        >
          <ArrowRightLeft className="h-6 w-6 mr-2" /> AUTO
        </Button>
        <Button
          variant="outline"
          className={cn(
            "h-16 px-8 text-lg font-bold",
            state.fadeToBlack.isFullyBlack && "bg-red-800 border-red-700 text-white",
            state.fadeToBlack.inTransition && "animate-pulse bg-red-900 border-red-800"
          )}
          onClick={() => send({ type: "atem_ftb" })}
          data-testid="button-ftb"
        >
          FTB
        </Button>
      </div>

      <div className="bg-slate-300/80 dark:bg-slate-900/80 border border-slate-300 dark:border-slate-700 rounded-lg p-4">
        <div className="text-xs font-mono text-slate-500 mb-2">STATUS</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-slate-500">Preview:</span>
            <span className="ml-2 text-green-400 font-mono">{getInputLabel(state.previewInput)}</span>
          </div>
          <div>
            <span className="text-slate-500">Program:</span>
            <span className="ml-2 text-red-400 font-mono">{getInputLabel(state.programInput)}</span>
          </div>
          <div>
            <span className="text-slate-500">Transition:</span>
            <span className="ml-2 text-slate-900 dark:text-white font-mono">{TRANSITION_STYLES[state.transition.nextStyle]?.label || "MIX"}</span>
          </div>
          <div>
            <span className="text-slate-500">FTB:</span>
            <span className={cn("ml-2 font-mono", state.fadeToBlack.isFullyBlack ? "text-red-400" : "text-slate-600 dark:text-slate-300")}>
              {state.fadeToBlack.isFullyBlack ? "BLACK" : "LIVE"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function TransitionSection({ state, send }: { state: AtemState; send: (msg: any) => void }) {
  const currentRate = (() => {
    switch (state.transition.nextStyle) {
      case 0: return state.transition.mixRate;
      case 1: return state.transition.dipRate;
      case 2: return state.transition.wipeRate;
      case 3: return state.transition.dveRate;
      default: return state.transition.mixRate;
    }
  })();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-300/80 dark:bg-slate-900/80 border border-slate-300 dark:border-slate-700 rounded-lg p-5">
          <div className="text-xs font-mono text-purple-400 mb-4 tracking-widest">TRANSITION STYLE</div>
          <div className="grid grid-cols-5 gap-2">
            {TRANSITION_STYLES.map((style) => (
              <Button
                key={style.value}
                variant="outline"
                onClick={() => send({ type: "atem_transition_style", style: style.value })}
                className={cn(
                  "h-14 font-mono font-bold",
                  state.transition.nextStyle === style.value && "bg-purple-600 border-purple-500 text-white hover:bg-purple-700"
                )}
                data-testid={`button-transition-${style.label.toLowerCase()}`}
              >
                {style.label}
              </Button>
            ))}
          </div>

          <div className="mt-4 flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => send({ type: "atem_transition_preview", enabled: !state.transition.previewEnabled })}
              className={cn(
                "text-xs",
                state.transition.previewEnabled && "bg-yellow-600 border-yellow-500 text-white"
              )}
              data-testid="button-prev-trans"
            >
              PREV TRANS
            </Button>
          </div>
        </div>

        <div className="bg-slate-300/80 dark:bg-slate-900/80 border border-slate-300 dark:border-slate-700 rounded-lg p-5">
          <div className="text-xs font-mono text-purple-400 mb-4 tracking-widest">TRANSITION RATE</div>
          <div className="flex items-center gap-4">
            <div className="text-3xl font-mono text-slate-900 dark:text-white font-bold min-w-[80px] text-center">
              {currentRate}
            </div>
            <div className="text-sm text-slate-500 dark:text-slate-400">frames</div>
          </div>

          <div className="mt-4 space-y-3">
            <div>
              <div className="text-xs text-slate-500 mb-1">MIX Rate: {state.transition.mixRate}f</div>
              <Slider
                value={[state.transition.mixRate]}
                onValueChange={(v) => send({ type: "atem_mix_rate", rate: v[0] })}
                min={1} max={250} step={1}
                className="w-full"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-300/80 dark:bg-slate-900/80 border border-slate-300 dark:border-slate-700 rounded-lg p-5">
          <div className="text-xs font-mono text-purple-400 mb-4 tracking-widest">TRANSITION CONTROLS</div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              className={cn("flex-1 h-16 text-xl font-bold", state.inTransition && "animate-pulse")}
              onClick={() => send({ type: "atem_cut" })}
              data-testid="button-cut-transition"
            >
              <Zap className="h-6 w-6 mr-2" /> CUT
            </Button>
            <Button
              variant="outline"
              className={cn("flex-1 h-16 text-xl font-bold", state.inTransition && "bg-amber-600 border-amber-500")}
              onClick={() => send({ type: "atem_auto" })}
              data-testid="button-auto-transition"
            >
              <ArrowRightLeft className="h-6 w-6 mr-2" /> AUTO
            </Button>
          </div>

          <div className="mt-4">
            <div className="text-xs text-slate-500 mb-2">T-Bar Position</div>
            <Slider
              value={[state.transition.position / 10000 * 100]}
              onValueChange={(v) => send({ type: "atem_transition_position", position: Math.round(v[0] / 100 * 10000) })}
              min={0} max={100} step={1}
              className="w-full"
            />
            <div className="text-xs text-slate-500 mt-1 text-center font-mono">
              {Math.round(state.transition.position / 10000 * 100)}%
            </div>
          </div>
        </div>

        <div className="bg-slate-300/80 dark:bg-slate-900/80 border border-slate-300 dark:border-slate-700 rounded-lg p-5">
          <div className="text-xs font-mono text-red-400 mb-4 tracking-widest">FADE TO BLACK</div>
          <Button
            variant="outline"
            className={cn(
              "w-full h-16 text-xl font-bold",
              state.fadeToBlack.isFullyBlack && "bg-red-800 border-red-700 text-white",
              state.fadeToBlack.inTransition && "animate-pulse bg-red-900 border-red-800"
            )}
            onClick={() => send({ type: "atem_ftb" })}
            data-testid="button-ftb-transition"
          >
            {state.fadeToBlack.isFullyBlack ? "FADE UP" : "FADE TO BLACK"}
          </Button>

          <div className="mt-4">
            <div className="text-xs text-slate-500 mb-1">FTB Rate: {state.fadeToBlack.rate}f</div>
            <Slider
              value={[state.fadeToBlack.rate]}
              onValueChange={(v) => send({ type: "atem_ftb_rate", rate: v[0] })}
              min={1} max={250} step={1}
              className="w-full"
            />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-slate-500">Status:</span>
              <span className={cn("ml-2 font-mono", state.fadeToBlack.isFullyBlack ? "text-red-400" : "text-green-400")}>
                {state.fadeToBlack.isFullyBlack ? "BLACK" : "LIVE"}
              </span>
            </div>
            <div>
              <span className="text-slate-500">Remaining:</span>
              <span className="ml-2 font-mono text-slate-900 dark:text-white">{state.fadeToBlack.remainingFrames}f</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function USKSection({ state, send, getInputLabel }: { state: AtemState; send: (msg: any) => void; getInputLabel: (id: number) => string }) {
  if (state.upstreamKeyers.length === 0) {
    return (
      <div className="bg-slate-300/80 dark:bg-slate-900/80 border border-slate-300 dark:border-slate-700 rounded-lg p-8 text-center">
        <div className="text-slate-500 text-lg">No Upstream Keyers Available</div>
        <p className="text-slate-400 dark:text-slate-600 text-sm mt-2">Upstream keyers will appear when connected to an ATEM with keyer capability</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {state.upstreamKeyers.map((usk) => (
        <div key={usk.index} className="bg-slate-300/80 dark:bg-slate-900/80 border border-slate-300 dark:border-slate-700 rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="text-xs font-mono text-amber-400 tracking-widest">UPSTREAM KEY {usk.index + 1}</div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => send({ type: "atem_usk_on_air", index: usk.index, onAir: !usk.onAir })}
              className={cn(
                "font-bold text-sm",
                usk.onAir ? "bg-red-600 border-red-500 text-white hover:bg-red-700" : "text-slate-500 dark:text-slate-400"
              )}
              data-testid={`button-usk-${usk.index}-onair`}
            >
              {usk.onAir ? "ON AIR" : "OFF"}
            </Button>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-slate-500">Type:</span>
                <span className="ml-2 text-slate-900 dark:text-white font-mono">{KEY_TYPES[usk.type] || "Unknown"}</span>
              </div>
              <div>
                <span className="text-slate-500">Fly:</span>
                <span className={cn("ml-2 font-mono", usk.flyEnabled ? "text-green-400" : "text-slate-500")}>
                  {usk.flyEnabled ? "Enabled" : "Disabled"}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-slate-500">Fill:</span>
                <span className="ml-2 text-slate-900 dark:text-white font-mono">{getInputLabel(usk.fillSource)}</span>
              </div>
              <div>
                <span className="text-slate-500">Key:</span>
                <span className="ml-2 text-slate-900 dark:text-white font-mono">{getInputLabel(usk.cutSource)}</span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function DSKSection({ state, send }: { state: AtemState; send: (msg: any) => void }) {
  if (state.downstreamKeyers.length === 0) {
    return (
      <div className="bg-slate-300/80 dark:bg-slate-900/80 border border-slate-300 dark:border-slate-700 rounded-lg p-8 text-center">
        <div className="text-slate-500 text-lg">No Downstream Keyers Available</div>
        <p className="text-slate-400 dark:text-slate-600 text-sm mt-2">Downstream keyers will appear when connected to an ATEM</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {state.downstreamKeyers.map((dsk) => (
        <div key={dsk.index} className="bg-slate-300/80 dark:bg-slate-900/80 border border-slate-300 dark:border-slate-700 rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="text-xs font-mono text-cyan-400 tracking-widest">DSK {dsk.index + 1}</div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => send({ type: "atem_dsk_tie", index: dsk.index, tie: !dsk.tie })}
                className={cn(
                  "text-xs",
                  dsk.tie && "bg-yellow-600 border-yellow-500 text-white hover:bg-yellow-700"
                )}
                data-testid={`button-dsk-${dsk.index}-tie`}
              >
                TIE
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => send({ type: "atem_dsk_on_air", index: dsk.index, onAir: !dsk.onAir })}
                className={cn(
                  "font-bold text-sm",
                  dsk.onAir ? "bg-red-600 border-red-500 text-white hover:bg-red-700" : "text-slate-500 dark:text-slate-400"
                )}
                data-testid={`button-dsk-${dsk.index}-onair`}
              >
                {dsk.onAir ? "ON AIR" : "OFF"}
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            <Button
              variant="outline"
              className={cn(
                "w-full h-12 font-bold",
                dsk.inTransition && "animate-pulse bg-amber-900 border-amber-800"
              )}
              onClick={() => send({ type: "atem_dsk_auto", index: dsk.index })}
              data-testid={`button-dsk-${dsk.index}-auto`}
            >
              <ArrowRightLeft className="h-4 w-4 mr-2" /> AUTO
            </Button>

            <div>
              <div className="text-xs text-slate-500 mb-1">Rate: {dsk.rate}f</div>
              <Slider
                value={[dsk.rate]}
                onValueChange={(v) => send({ type: "atem_dsk_rate", index: dsk.index, rate: v[0] })}
                min={1} max={250} step={1}
                className="w-full"
              />
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-slate-500">Status:</span>
                <span className={cn("ml-2 font-mono", dsk.onAir ? "text-red-400" : "text-slate-600 dark:text-slate-300")}>
                  {dsk.onAir ? "ON AIR" : "OFF"}
                </span>
              </div>
              <div>
                <span className="text-slate-500">Remaining:</span>
                <span className="ml-2 font-mono text-slate-900 dark:text-white">{dsk.remainingFrames}f</span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function MacroSection({ state, send }: { state: AtemState; send: (msg: any) => void }) {
  const macros = state.macros.filter(m => m.isUsed);

  return (
    <div className="space-y-6">
      <div className="bg-slate-300/80 dark:bg-slate-900/80 border border-slate-300 dark:border-slate-700 rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="text-xs font-mono text-emerald-400 tracking-widest">MACRO PLAYER</div>
          <div className="flex items-center gap-2">
            {state.macroPlayer.isRunning && (
              <span className="text-xs font-mono text-emerald-400 animate-pulse">RUNNING</span>
            )}
            {state.macroPlayer.isWaiting && (
              <span className="text-xs font-mono text-yellow-400">WAITING</span>
            )}
            {state.macroPlayer.loop && (
              <Repeat className="h-4 w-4 text-emerald-400" />
            )}
          </div>
        </div>

        <div className="flex gap-2">
          {state.macroPlayer.isWaiting && (
            <Button
              variant="outline"
              onClick={() => send({ type: "atem_macro_continue" })}
              className="flex-1 h-12"
              data-testid="button-macro-continue"
            >
              <SkipForward className="h-4 w-4 mr-2" /> Continue
            </Button>
          )}
          {state.macroPlayer.isRunning && (
            <Button
              variant="outline"
              onClick={() => send({ type: "atem_macro_stop" })}
              className="flex-1 h-12 text-red-400 hover:text-red-300"
              data-testid="button-macro-stop"
            >
              <Square className="h-4 w-4 mr-2" /> Stop
            </Button>
          )}
        </div>
      </div>

      {macros.length === 0 ? (
        <div className="bg-slate-300/80 dark:bg-slate-900/80 border border-slate-300 dark:border-slate-700 rounded-lg p-8 text-center">
          <div className="text-slate-500 text-lg">No Macros Available</div>
          <p className="text-slate-400 dark:text-slate-600 text-sm mt-2">Create macros on your ATEM to see them here</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {macros.map((macro) => (
            <Button
              key={macro.index}
              variant="outline"
              onClick={() => send({ type: "atem_macro_run", index: macro.index })}
              className={cn(
                "h-16 flex flex-col gap-1 font-mono",
                state.macroPlayer.isRunning && state.macroPlayer.macroIndex === macro.index && "bg-emerald-600 border-emerald-500 text-white"
              )}
              data-testid={`button-macro-${macro.index}`}
            >
              <Play className="h-4 w-4" />
              <span className="text-xs truncate w-full text-center">{macro.name}</span>
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
