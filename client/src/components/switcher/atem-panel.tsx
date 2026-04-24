import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { switcherApi } from "@/lib/api";
import { useAtemControl } from "@/hooks/use-atem-control";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MonitorPlay, Plus, Wifi, WifiOff, ArrowRightLeft, Zap } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface AtemPanelProps {
  collapsed?: boolean;
}

export function AtemPanel({ collapsed = false }: AtemPanelProps) {
  const queryClient = useQueryClient();
  const { atemState, switcher, cut, auto, setProgramInput, setPreviewInput } = useAtemControl();
  const [addSwitcherOpen, setAddSwitcherOpen] = useState(false);
  const [newSwitcher, setNewSwitcher] = useState({ name: "ATEM Extreme", ip: "", type: "atem" });
  const controlTimedOut = switcher?.status === "control-timeout";

  const createSwitcherMutation = useMutation({
    mutationFn: switcherApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["switchers"] });
      setAddSwitcherOpen(false);
      setNewSwitcher({ name: "ATEM Extreme", ip: "", type: "atem" });
      toast.success("ATEM switcher added");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const connectSwitcherMutation = useMutation({
    mutationFn: switcherApi.connect,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["switchers"] });
      if (data.success) {
        toast.success("Connected to ATEM");
      } else {
        toast.error(data.message || "ATEM control handshake timed out");
      }
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  if (collapsed) {
    return (
      <div className="bg-slate-300/80 dark:bg-slate-900/80 border border-slate-300 dark:border-slate-700 rounded-lg p-3">
        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-400">
          <MonitorPlay className="h-4 w-4" />
          <span className="text-sm">Switcher</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-300/80 dark:bg-slate-900/80 border border-slate-300 dark:border-slate-700 rounded-lg p-4" data-testid="atem-panel">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <MonitorPlay className="h-5 w-5 text-purple-500 dark:text-purple-400" />
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Video Switcher</h2>
        </div>

        {switcher ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-700 dark:text-slate-400">{switcher.name}</span>
            {atemState.connected ? (
              <Wifi className="h-4 w-4 text-green-500" />
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => connectSwitcherMutation.mutate(switcher.id)}
                disabled={connectSwitcherMutation.isPending}
                className="text-slate-700 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                data-testid="button-connect-switcher"
              >
                <WifiOff className="h-4 w-4 mr-1" />
                {connectSwitcherMutation.isPending ? "Connecting..." : "Connect"}
              </Button>
            )}
          </div>
        ) : (
          <Dialog open={addSwitcherOpen} onOpenChange={setAddSwitcherOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" data-testid="button-add-switcher">
                <Plus className="h-4 w-4 mr-1" />
                Add ATEM
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add ATEM Switcher</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="switcher-name">Name</Label>
                  <Input
                    id="switcher-name"
                    value={newSwitcher.name}
                    onChange={(e) => setNewSwitcher({ ...newSwitcher, name: e.target.value })}
                    placeholder="ATEM Extreme"
                    data-testid="input-switcher-name"
                  />
                </div>
                <div>
                  <Label htmlFor="switcher-ip">IP Address</Label>
                  <Input
                    id="switcher-ip"
                    value={newSwitcher.ip}
                    onChange={(e) => setNewSwitcher({ ...newSwitcher, ip: e.target.value })}
                    placeholder="192.168.1.100"
                    data-testid="input-switcher-ip"
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={() => createSwitcherMutation.mutate(newSwitcher)}
                  disabled={!newSwitcher.ip || createSwitcherMutation.isPending}
                  data-testid="button-save-switcher"
                >
                  {createSwitcherMutation.isPending ? "Adding..." : "Add Switcher"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {!switcher ? (
        <div className="text-center py-8 text-slate-700 dark:text-slate-500">
          <MonitorPlay className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>No switcher configured</p>
          <p className="text-sm">Add your ATEM to get started</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => setAddSwitcherOpen(true)}
            data-testid="button-add-switcher-empty"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add ATEM
          </Button>
        </div>
      ) : !atemState.connected ? (
        <div className="text-center py-8 text-slate-700 dark:text-slate-500">
          <WifiOff className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>{controlTimedOut ? "ATEM control timed out" : "Switcher not connected"}</p>
          <p className="text-sm">
            {controlTimedOut
              ? "The switcher may be online, but the ATEM control session did not answer."
              : "Click Connect to establish connection"}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => connectSwitcherMutation.mutate(switcher.id)}
            disabled={connectSwitcherMutation.isPending}
            data-testid="button-connect-switcher-empty"
          >
            <WifiOff className="h-4 w-4 mr-2" />
            {connectSwitcherMutation.isPending ? "Connecting..." : "Connect ATEM"}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs font-mono text-slate-700 dark:text-slate-500 mb-2">PREVIEW</div>
              <div className="grid grid-cols-4 gap-1">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((input) => (
                  <Button
                    key={input}
                    variant="outline"
                    size="sm"
                    onClick={() => setPreviewInput(input)}
                    className={cn(
                      "h-10 font-mono",
                      atemState.previewInput === input && "bg-green-600 border-green-500 text-white"
                    )}
                    data-testid={`button-preview-input-${input}`}
                  >
                    {input}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs font-mono text-slate-700 dark:text-slate-500 mb-2">PROGRAM</div>
              <div className="grid grid-cols-4 gap-1">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((input) => (
                  <Button
                    key={input}
                    variant="outline"
                    size="sm"
                    onClick={() => setProgramInput(input)}
                    className={cn(
                      "h-10 font-mono",
                      atemState.programInput === input && "bg-red-600 border-red-500 text-white"
                    )}
                    data-testid={`button-program-input-${input}`}
                  >
                    {input}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              className={cn(
                "flex-1 h-14 text-lg font-bold",
                atemState.inTransition && "animate-pulse"
              )}
              onClick={cut}
              data-testid="button-atem-cut"
            >
              <Zap className="h-5 w-5 mr-2" />
              CUT
            </Button>
            <Button
              variant="outline"
              className={cn(
                "flex-1 h-14 text-lg font-bold",
                atemState.inTransition && "bg-amber-600 border-amber-500"
              )}
              onClick={auto}
              data-testid="button-atem-auto"
            >
              <ArrowRightLeft className="h-5 w-5 mr-2" />
              AUTO
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
