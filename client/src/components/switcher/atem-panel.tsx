import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { switcherApi } from "@/lib/api";
import { useAtemControl } from "@/hooks/use-atem-control";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MonitorPlay, Plus, Wifi, WifiOff } from "lucide-react";
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
        toast.error("Failed to connect to ATEM");
      }
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  if (collapsed) {
    return (
      <div className="bg-[#1a1a2e] border border-[#2a2a3e] rounded-lg p-3">
        <div className="flex items-center gap-2 text-slate-400">
          <MonitorPlay className="h-4 w-4" />
          <span className="text-sm">Switcher</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#1a1a2e] border border-[#2a2a3e] rounded-lg overflow-hidden" data-testid="atem-panel">
      <div className="flex items-center justify-between px-4 py-3 bg-[#12121f] border-b border-[#2a2a3e]">
        <div className="flex items-center gap-2">
          <MonitorPlay className="h-5 w-5 text-purple-400" />
          <h2 className="text-lg font-semibold text-white">Video Switcher</h2>
        </div>

        {switcher ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400">{switcher.name}</span>
            {atemState.connected ? (
              <Wifi className="h-4 w-4 text-green-500" />
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => connectSwitcherMutation.mutate(switcher.id)}
                className="text-slate-400 hover:text-white"
                data-testid="button-connect-switcher"
              >
                <WifiOff className="h-4 w-4 mr-1" />
                Connect
              </Button>
            )}
          </div>
        ) : (
          <Dialog open={addSwitcherOpen} onOpenChange={setAddSwitcherOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="border-[#3a3a4e] text-slate-300 hover:bg-[#2a2a3e] hover:text-white" data-testid="button-add-switcher">
                <Plus className="h-4 w-4 mr-1" />
                Add ATEM
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-slate-300 dark:bg-slate-900 border-slate-300 dark:border-slate-700">
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
        <div className="text-center py-8 text-slate-500">
          <MonitorPlay className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>No switcher configured</p>
          <p className="text-sm">Add your ATEM to get started</p>
        </div>
      ) : !atemState.connected ? (
        <div className="text-center py-8 text-slate-500">
          <WifiOff className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>Switcher offline</p>
          <p className="text-sm">Click Connect to establish connection</p>
        </div>
      ) : (
        <div className="p-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] font-bold text-white mb-1.5 tracking-wide">Program</div>
              <div className="grid grid-cols-4 gap-1">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((input) => (
                  <button
                    key={input}
                    onClick={() => setProgramInput(input)}
                    className={cn(
                      "h-9 font-mono font-bold text-sm border transition-colors",
                      atemState.programInput === input
                        ? "bg-red-600 border-red-500 text-white"
                        : "bg-[#2a2a3e] border-[#3a3a4e] text-slate-400 hover:text-white hover:bg-[#3a3a4e]"
                    )}
                    data-testid={`button-program-input-${input}`}
                  >
                    {input}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold text-white mb-1.5 tracking-wide">Preview</div>
              <div className="grid grid-cols-4 gap-1">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((input) => (
                  <button
                    key={input}
                    onClick={() => setPreviewInput(input)}
                    className={cn(
                      "h-9 font-mono font-bold text-sm border transition-colors",
                      atemState.previewInput === input
                        ? "bg-green-600 border-green-500 text-white"
                        : "bg-[#2a2a3e] border-[#3a3a4e] text-slate-400 hover:text-white hover:bg-[#3a3a4e]"
                    )}
                    data-testid={`button-preview-input-${input}`}
                  >
                    {input}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={cut}
              className={cn(
                "flex-1 h-12 text-sm font-bold border transition-colors",
                atemState.inTransition
                  ? "bg-red-700 border-red-600 text-white animate-pulse"
                  : "bg-red-600 border-red-500 text-white hover:bg-red-700"
              )}
              data-testid="button-atem-cut"
            >
              CUT
            </button>
            <button
              onClick={auto}
              className={cn(
                "flex-1 h-12 text-sm font-bold border transition-colors",
                atemState.inTransition
                  ? "bg-amber-500 border-amber-400 text-black"
                  : "bg-amber-600 border-amber-500 text-white hover:bg-amber-500"
              )}
              data-testid="button-atem-auto"
            >
              AUTO
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
