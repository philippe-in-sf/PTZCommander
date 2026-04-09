import { useState, useCallback, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { switcherApi } from "@/lib/api";
import { useAtemControl, type AtemState } from "@/hooks/use-atem-control";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MonitorPlay, Plus, Wifi, WifiOff, Settings, Trash2, AlertTriangle, Play, Square, SkipForward, Repeat } from "lucide-react";
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
      else toast.error("Failed to connect to ATEM");
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
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Switcher Offline</h2>
            <p className="text-slate-500 dark:text-slate-400">Click Connect to establish connection to {switcher.name}</p>
            <Button onClick={() => connectSwitcherMutation.mutate(switcher.id)} disabled={connectSwitcherMutation.isPending} data-testid="button-connect-switcher-big">
              <Wifi className="h-4 w-4 mr-2" />
              {connectSwitcherMutation.isPending ? "Connecting..." : "Connect"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden bg-[#1a1a2e] dark:bg-[#1a1a2e]">
          <div className="border-b border-[#2a2a3e] bg-[#12121f] px-4">
            <div className="flex items-center gap-1 py-2">
              {SWITCHER_TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    "px-5 py-2.5 text-sm font-semibold tracking-wide transition-colors border border-transparent",
                    activeTab === tab.key
                      ? "bg-[#2563eb] text-white border-[#3b82f6]"
                      : "text-slate-400 hover:text-white hover:bg-[#2a2a3e]"
                  )}
                  data-testid={`tab-${tab.key}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-auto p-4">
            <div className="max-w-5xl mx-auto space-y-4">
              {activeTab === "me" && <MESection state={atemState} send={send} displayInputs={displayInputs} getInputLabel={getInputLabel} />}
              {activeTab === "transition" && <TransitionSection state={atemState} send={send} />}
              {activeTab === "keyers" && <USKSection state={atemState} send={send} getInputLabel={getInputLabel} />}
              {activeTab === "dsk" && <DSKSection state={atemState} send={send} />}
              {activeTab === "macros" && <MacroSection state={atemState} send={send} />}
            </div>
          </div>
        </div>
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

function ConsoleSlider({ value, min, max, step, onChange }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const knobWidth = 20;
  const trackPadding = 4;

  const ratio = (value - min) / (max - min);

  const updateValue = useCallback((e: React.PointerEvent) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const usableWidth = rect.width - knobWidth - trackPadding * 2;
    const x = e.clientX - rect.left - trackPadding - knobWidth / 2;
    const r = Math.max(0, Math.min(1, x / usableWidth));
    const raw = min + r * (max - min);
    onChange(Math.round(raw / step) * step);
  }, [min, max, step, onChange]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    isDragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updateValue(e);
  }, [updateValue]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (isDragging.current) updateValue(e);
  }, [updateValue]);

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  return (
    <div
      ref={trackRef}
      className="relative cursor-pointer select-none touch-none w-full"
      style={{ height: 28 }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div
        className="absolute top-1/2 -translate-y-1/2 rounded-sm"
        style={{
          height: 4,
          left: trackPadding,
          right: trackPadding,
          background: 'linear-gradient(to right, #1a1a2e, #0f0f1a)',
          boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5)',
        }}
      />
      <div
        className="absolute top-1/2 -translate-y-1/2 rounded-sm"
        style={{
          height: 4,
          left: trackPadding,
          width: `calc(${ratio * 100}% - ${trackPadding}px)`,
          background: 'linear-gradient(to right, #d97706, #f59e0b)',
          opacity: 0.8,
        }}
      />
      <div
        className="absolute top-1/2 -translate-y-1/2"
        style={{
          width: knobWidth,
          height: 18,
          left: `calc(${trackPadding}px + ${ratio} * (100% - ${knobWidth + trackPadding * 2}px))`,
          background: 'linear-gradient(to bottom, #d97706, #b45309)',
          borderRadius: 2,
          boxShadow: '0 1px 4px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.2)',
        }}
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" style={{ width: 2, height: 10, background: 'rgba(255,255,255,0.3)', borderRadius: 1 }} />
      </div>
    </div>
  );
}

function SwitcherInputButton({ inputId, shortName, isActive, color, onClick, testId }: {
  inputId: number;
  shortName: string;
  isActive: boolean;
  color: "red" | "green";
  onClick: () => void;
  testId: string;
}) {
  const activeClass = color === "red"
    ? "bg-red-600 border-red-500 text-white"
    : "bg-green-600 border-green-500 text-white";

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center border transition-colors h-14",
        isActive
          ? activeClass
          : "bg-[#2a2a3e] border-[#3a3a4e] text-slate-400 hover:bg-[#3a3a4e] hover:text-white"
      )}
      data-testid={testId}
    >
      <span className="text-[8px] opacity-60 truncate w-full text-center px-0.5">{shortName}</span>
      <span className="text-lg font-bold leading-tight">{inputId}</span>
    </button>
  );
}

function MESection({ state, send, displayInputs, getInputLabel }: { state: AtemState; send: (msg: any) => void; displayInputs: AtemState["inputs"]; getInputLabel: (id: number) => string }) {
  return (
    <div className="space-y-4">
      <div className="bg-[#1e1e32] border border-[#2a2a3e] p-4">
        <div className="text-sm font-bold text-white mb-3 tracking-wide">Program</div>
        <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-1">
          {displayInputs.map((input) => (
            <SwitcherInputButton
              key={input.inputId}
              inputId={input.inputId}
              shortName={input.shortName}
              isActive={state.programInput === input.inputId}
              color="red"
              onClick={() => send({ type: "atem_program", inputId: input.inputId })}
              testId={`button-program-${input.inputId}`}
            />
          ))}
        </div>
      </div>

      <div className="bg-[#1e1e32] border border-[#2a2a3e] p-4">
        <div className="text-sm font-bold text-white mb-3 tracking-wide">Preview</div>
        <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-1">
          {displayInputs.map((input) => (
            <SwitcherInputButton
              key={input.inputId}
              inputId={input.inputId}
              shortName={input.shortName}
              isActive={state.previewInput === input.inputId}
              color="green"
              onClick={() => send({ type: "atem_preview", inputId: input.inputId })}
              testId={`button-preview-${input.inputId}`}
            />
          ))}
        </div>
      </div>

      <div className="bg-[#1e1e32] border border-[#2a2a3e] p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="text-sm font-bold text-white tracking-wide">TRANSITION</div>
            <div className="flex gap-1">
              {TRANSITION_STYLES.slice(0, 4).map((style) => (
                <button
                  key={style.value}
                  onClick={() => send({ type: "atem_transition_style", style: style.value })}
                  className={cn(
                    "px-3 py-1.5 text-xs font-bold border transition-colors",
                    state.transition.nextStyle === style.value
                      ? "bg-[#2563eb] border-[#3b82f6] text-white"
                      : "bg-[#2a2a3e] border-[#3a3a4e] text-slate-400 hover:text-white hover:bg-[#3a3a4e]"
                  )}
                  data-testid={`button-transition-${style.label.toLowerCase()}`}
                >
                  {style.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 ml-4">
              <span className="text-xs text-slate-400">Transition Rate</span>
              <span className="text-sm font-mono text-white font-bold min-w-[24px] text-center">
                {(() => {
                  switch (state.transition.nextStyle) {
                    case 0: return state.transition.mixRate;
                    case 1: return state.transition.dipRate;
                    case 2: return state.transition.wipeRate;
                    case 3: return state.transition.dveRate;
                    default: return state.transition.mixRate;
                  }
                })()}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => send({ type: "atem_cut" })}
              className={cn(
                "px-5 py-2 text-sm font-bold border transition-colors",
                "bg-red-600 border-red-500 text-white hover:bg-red-700"
              )}
              data-testid="button-cut"
            >
              CUT
            </button>
            <button
              onClick={() => send({ type: "atem_auto" })}
              className={cn(
                "px-5 py-2 text-sm font-bold border transition-colors",
                state.inTransition
                  ? "bg-amber-500 border-amber-400 text-black"
                  : "bg-amber-600 border-amber-500 text-white hover:bg-amber-500"
              )}
              data-testid="button-auto"
            >
              AUTO
            </button>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <div className="flex gap-1">
            <button
              onClick={() => send({ type: "atem_transition_preview", enabled: !state.transition.previewEnabled })}
              className={cn(
                "px-2 py-1 text-[10px] font-bold border transition-colors",
                state.transition.previewEnabled
                  ? "bg-yellow-600 border-yellow-500 text-white"
                  : "bg-[#2a2a3e] border-[#3a3a4e] text-slate-500 hover:text-white"
              )}
              data-testid="button-prev-trans"
            >
              PREV TRANS
            </button>
          </div>
          <div className="flex-1">
            <ConsoleSlider
              value={(() => {
                switch (state.transition.nextStyle) {
                  case 0: return state.transition.mixRate;
                  case 1: return state.transition.dipRate;
                  case 2: return state.transition.wipeRate;
                  case 3: return state.transition.dveRate;
                  default: return state.transition.mixRate;
                }
              })()}
              min={1}
              max={250}
              step={1}
              onChange={(v) => {
                const type = (() => {
                  switch (state.transition.nextStyle) {
                    case 0: return "atem_mix_rate";
                    case 1: return "atem_dip_rate";
                    case 2: return "atem_wipe_rate";
                    case 3: return "atem_dve_rate";
                    default: return "atem_mix_rate";
                  }
                })();
                send({ type, rate: v });
              }}
            />
          </div>
        </div>
      </div>

      <div className="bg-[#1e1e32] border border-[#2a2a3e] p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-bold text-white tracking-wide">FADE TO BLACK</div>
            <div className="text-xs text-slate-500 mt-1 font-mono">
              Rate: {state.fadeToBlack.rate}f
              <span className="ml-4">
                Status: <span className={state.fadeToBlack.isFullyBlack ? "text-red-400" : "text-green-400"}>
                  {state.fadeToBlack.isFullyBlack ? "BLACK" : "LIVE"}
                </span>
              </span>
            </div>
          </div>
          <button
            onClick={() => send({ type: "atem_ftb" })}
            className={cn(
              "px-6 py-2.5 text-sm font-bold border transition-colors",
              state.fadeToBlack.isFullyBlack
                ? "bg-red-800 border-red-700 text-white animate-pulse"
                : state.fadeToBlack.inTransition
                  ? "bg-red-900 border-red-800 text-white animate-pulse"
                  : "bg-[#2a2a3e] border-[#3a3a4e] text-slate-400 hover:bg-red-900 hover:text-white hover:border-red-800"
            )}
            data-testid="button-ftb"
          >
            FTB
          </button>
        </div>
        <div className="mt-2">
          <ConsoleSlider
            value={state.fadeToBlack.rate}
            min={1}
            max={250}
            step={1}
            onChange={(v) => send({ type: "atem_ftb_rate", rate: v })}
          />
        </div>
      </div>

      <div className="bg-[#1e1e32] border border-[#2a2a3e] p-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <div>
            <span className="text-slate-500">Preview:</span>
            <span className="ml-2 text-green-400 font-mono font-bold">{getInputLabel(state.previewInput)}</span>
          </div>
          <div>
            <span className="text-slate-500">Program:</span>
            <span className="ml-2 text-red-400 font-mono font-bold">{getInputLabel(state.programInput)}</span>
          </div>
          <div>
            <span className="text-slate-500">Transition:</span>
            <span className="ml-2 text-white font-mono">{TRANSITION_STYLES[state.transition.nextStyle]?.label || "MIX"}</span>
          </div>
          <div>
            <span className="text-slate-500">FTB:</span>
            <span className={cn("ml-2 font-mono", state.fadeToBlack.isFullyBlack ? "text-red-400" : "text-green-400")}>
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
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[#1e1e32] border border-[#2a2a3e] p-5">
          <div className="text-xs font-mono text-purple-400 mb-4 tracking-widest">TRANSITION STYLE</div>
          <div className="grid grid-cols-5 gap-1">
            {TRANSITION_STYLES.map((style) => (
              <button
                key={style.value}
                onClick={() => send({ type: "atem_transition_style", style: style.value })}
                className={cn(
                  "h-12 font-bold text-sm border transition-colors",
                  state.transition.nextStyle === style.value
                    ? "bg-purple-600 border-purple-500 text-white"
                    : "bg-[#2a2a3e] border-[#3a3a4e] text-slate-400 hover:text-white hover:bg-[#3a3a4e]"
                )}
                data-testid={`button-transition-${style.label.toLowerCase()}`}
              >
                {style.label}
              </button>
            ))}
          </div>

          <div className="mt-4">
            <button
              onClick={() => send({ type: "atem_transition_preview", enabled: !state.transition.previewEnabled })}
              className={cn(
                "px-3 py-1.5 text-xs font-bold border transition-colors",
                state.transition.previewEnabled
                  ? "bg-yellow-600 border-yellow-500 text-white"
                  : "bg-[#2a2a3e] border-[#3a3a4e] text-slate-500 hover:text-white"
              )}
              data-testid="button-prev-trans"
            >
              PREV TRANS
            </button>
          </div>
        </div>

        <div className="bg-[#1e1e32] border border-[#2a2a3e] p-5">
          <div className="text-xs font-mono text-purple-400 mb-4 tracking-widest">TRANSITION RATE</div>
          <div className="flex items-center gap-4 mb-4">
            <div className="text-3xl font-mono text-white font-bold min-w-[80px] text-center">
              {currentRate}
            </div>
            <div className="text-sm text-slate-500">frames</div>
          </div>

          <div className="space-y-3">
            <div>
              <div className="text-xs text-slate-500 mb-1">MIX Rate: {state.transition.mixRate}f</div>
              <ConsoleSlider
                value={state.transition.mixRate}
                min={1} max={250} step={1}
                onChange={(v) => send({ type: "atem_mix_rate", rate: v })}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[#1e1e32] border border-[#2a2a3e] p-5">
          <div className="text-xs font-mono text-purple-400 mb-4 tracking-widest">TRANSITION CONTROLS</div>
          <div className="flex gap-2">
            <button
              onClick={() => send({ type: "atem_cut" })}
              className={cn(
                "flex-1 h-14 text-lg font-bold border transition-colors",
                state.inTransition
                  ? "bg-red-700 border-red-600 text-white animate-pulse"
                  : "bg-red-600 border-red-500 text-white hover:bg-red-700"
              )}
              data-testid="button-cut-transition"
            >
              CUT
            </button>
            <button
              onClick={() => send({ type: "atem_auto" })}
              className={cn(
                "flex-1 h-14 text-lg font-bold border transition-colors",
                state.inTransition
                  ? "bg-amber-500 border-amber-400 text-black"
                  : "bg-amber-600 border-amber-500 text-white hover:bg-amber-500"
              )}
              data-testid="button-auto-transition"
            >
              AUTO
            </button>
          </div>

          <div className="mt-4">
            <div className="text-xs text-slate-500 mb-2">T-Bar Position</div>
            <ConsoleSlider
              value={Math.round(state.transition.position / 10000 * 100)}
              min={0} max={100} step={1}
              onChange={(v) => send({ type: "atem_transition_position", position: Math.round(v / 100 * 10000) })}
            />
            <div className="text-xs text-slate-500 mt-1 text-center font-mono">
              {Math.round(state.transition.position / 10000 * 100)}%
            </div>
          </div>
        </div>

        <div className="bg-[#1e1e32] border border-[#2a2a3e] p-5">
          <div className="text-xs font-mono text-red-400 mb-4 tracking-widest">FADE TO BLACK</div>
          <button
            onClick={() => send({ type: "atem_ftb" })}
            className={cn(
              "w-full h-14 text-lg font-bold border transition-colors",
              state.fadeToBlack.isFullyBlack
                ? "bg-red-800 border-red-700 text-white"
                : state.fadeToBlack.inTransition
                  ? "bg-red-900 border-red-800 text-white animate-pulse"
                  : "bg-[#2a2a3e] border-[#3a3a4e] text-slate-400 hover:bg-red-900 hover:text-white"
            )}
            data-testid="button-ftb-transition"
          >
            {state.fadeToBlack.isFullyBlack ? "FADE UP" : "FADE TO BLACK"}
          </button>

          <div className="mt-4">
            <div className="text-xs text-slate-500 mb-1">FTB Rate: {state.fadeToBlack.rate}f</div>
            <ConsoleSlider
              value={state.fadeToBlack.rate}
              min={1} max={250} step={1}
              onChange={(v) => send({ type: "atem_ftb_rate", rate: v })}
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
              <span className="ml-2 font-mono text-white">{state.fadeToBlack.remainingFrames}f</span>
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
      <div className="bg-[#1e1e32] border border-[#2a2a3e] p-8 text-center">
        <div className="text-slate-500 text-lg">No Upstream Keyers Available</div>
        <p className="text-slate-600 text-sm mt-2">Upstream keyers will appear when connected to an ATEM with keyer capability</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {state.upstreamKeyers.map((usk) => (
        <div key={usk.index} className="bg-[#1e1e32] border border-[#2a2a3e] p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="text-xs font-mono text-amber-400 tracking-widest">UPSTREAM KEY {usk.index + 1}</div>
            <button
              onClick={() => send({ type: "atem_usk_on_air", index: usk.index, onAir: !usk.onAir })}
              className={cn(
                "px-4 py-1.5 text-xs font-bold border transition-colors",
                usk.onAir
                  ? "bg-red-600 border-red-500 text-white"
                  : "bg-[#2a2a3e] border-[#3a3a4e] text-slate-500 hover:text-white"
              )}
              data-testid={`button-usk-${usk.index}-onair`}
            >
              {usk.onAir ? "ON AIR" : "OFF"}
            </button>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-slate-500">Type:</span>
                <span className="ml-2 text-white font-mono">{KEY_TYPES[usk.type] || "Unknown"}</span>
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
                <span className="ml-2 text-white font-mono">{getInputLabel(usk.fillSource)}</span>
              </div>
              <div>
                <span className="text-slate-500">Key:</span>
                <span className="ml-2 text-white font-mono">{getInputLabel(usk.cutSource)}</span>
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
      <div className="bg-[#1e1e32] border border-[#2a2a3e] p-8 text-center">
        <div className="text-slate-500 text-lg">No Downstream Keyers Available</div>
        <p className="text-slate-600 text-sm mt-2">Downstream keyers will appear when connected to an ATEM</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {state.downstreamKeyers.map((dsk) => (
        <div key={dsk.index} className="bg-[#1e1e32] border border-[#2a2a3e] p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="text-xs font-mono text-cyan-400 tracking-widest">DSK {dsk.index + 1}</div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => send({ type: "atem_dsk_tie", index: dsk.index, tie: !dsk.tie })}
                className={cn(
                  "px-3 py-1.5 text-xs font-bold border transition-colors",
                  dsk.tie
                    ? "bg-yellow-600 border-yellow-500 text-white"
                    : "bg-[#2a2a3e] border-[#3a3a4e] text-slate-500 hover:text-white"
                )}
                data-testid={`button-dsk-${dsk.index}-tie`}
              >
                TIE
              </button>
              <button
                onClick={() => send({ type: "atem_dsk_on_air", index: dsk.index, onAir: !dsk.onAir })}
                className={cn(
                  "px-4 py-1.5 text-xs font-bold border transition-colors",
                  dsk.onAir
                    ? "bg-red-600 border-red-500 text-white"
                    : "bg-[#2a2a3e] border-[#3a3a4e] text-slate-500 hover:text-white"
                )}
                data-testid={`button-dsk-${dsk.index}-onair`}
              >
                {dsk.onAir ? "ON AIR" : "OFF"}
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => send({ type: "atem_dsk_auto", index: dsk.index })}
              className={cn(
                "w-full h-12 font-bold border transition-colors",
                dsk.inTransition
                  ? "bg-amber-500 border-amber-400 text-black animate-pulse"
                  : "bg-[#2a2a3e] border-[#3a3a4e] text-slate-400 hover:text-white hover:bg-[#3a3a4e]"
              )}
              data-testid={`button-dsk-${dsk.index}-auto`}
            >
              AUTO
            </button>

            <div>
              <div className="text-xs text-slate-500 mb-1">Rate: {dsk.rate}f</div>
              <ConsoleSlider
                value={dsk.rate}
                min={1} max={250} step={1}
                onChange={(v) => send({ type: "atem_dsk_rate", index: dsk.index, rate: v })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-slate-500">Status:</span>
                <span className={cn("ml-2 font-mono", dsk.onAir ? "text-red-400" : "text-slate-400")}>
                  {dsk.onAir ? "ON AIR" : "OFF"}
                </span>
              </div>
              <div>
                <span className="text-slate-500">Remaining:</span>
                <span className="ml-2 font-mono text-white">{dsk.remainingFrames}f</span>
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
    <div className="space-y-4">
      <div className="bg-[#1e1e32] border border-[#2a2a3e] p-5">
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
            <button
              onClick={() => send({ type: "atem_macro_continue" })}
              className="flex-1 h-12 font-bold border bg-[#2a2a3e] border-[#3a3a4e] text-slate-400 hover:text-white hover:bg-[#3a3a4e] flex items-center justify-center gap-2"
              data-testid="button-macro-continue"
            >
              <SkipForward className="h-4 w-4" /> Continue
            </button>
          )}
          {state.macroPlayer.isRunning && (
            <button
              onClick={() => send({ type: "atem_macro_stop" })}
              className="flex-1 h-12 font-bold border bg-[#2a2a3e] border-red-800 text-red-400 hover:text-white hover:bg-red-900 flex items-center justify-center gap-2"
              data-testid="button-macro-stop"
            >
              <Square className="h-4 w-4" /> Stop
            </button>
          )}
        </div>
      </div>

      {macros.length === 0 ? (
        <div className="bg-[#1e1e32] border border-[#2a2a3e] p-8 text-center">
          <div className="text-slate-500 text-lg">No Macros Available</div>
          <p className="text-slate-600 text-sm mt-2">Create macros on your ATEM to see them here</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {macros.map((macro) => (
            <button
              key={macro.index}
              onClick={() => send({ type: "atem_macro_run", index: macro.index })}
              className={cn(
                "h-14 flex flex-col items-center justify-center gap-1 font-mono border transition-colors",
                state.macroPlayer.isRunning && state.macroPlayer.macroIndex === macro.index
                  ? "bg-emerald-600 border-emerald-500 text-white"
                  : "bg-[#2a2a3e] border-[#3a3a4e] text-slate-400 hover:text-white hover:bg-[#3a3a4e]"
              )}
              data-testid={`button-macro-${macro.index}`}
            >
              <Play className="h-4 w-4" />
              <span className="text-xs truncate w-full text-center px-1">{macro.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
