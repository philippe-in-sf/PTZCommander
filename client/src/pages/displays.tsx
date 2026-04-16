import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { displayApi, type DisplayCommandPayload, type SmartThingsDiscoveredDevice } from "@/lib/api";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Monitor, Plus, Power, PowerOff, RefreshCw, Search, Trash2, Volume2, VolumeX } from "lucide-react";
import type { DisplayDevice } from "@shared/schema";

const DISPLAY_BRANDS = [
  { value: "samsung_frame", label: "Samsung Frame" },
  { value: "hisense_canvas", label: "Hisense Canvas" },
  { value: "display", label: "Display" },
];

function displayStatus(display: DisplayDevice) {
  const power = display.powerState ? `Power ${display.powerState}` : "Power unknown";
  const volume = typeof display.volume === "number" ? `Vol ${display.volume}` : "Vol unknown";
  const input = display.inputSource ? `Input ${display.inputSource}` : "Input unknown";
  return [power, volume, input].join(" · ");
}

function DisplayCard({ display }: { display: DisplayDevice }) {
  const queryClient = useQueryClient();
  const [volume, setVolume] = useState(display.volume ?? 20);
  const [inputSource, setInputSource] = useState(display.inputSource ?? "");

  useEffect(() => {
    setVolume(display.volume ?? 20);
    setInputSource(display.inputSource ?? "");
  }, [display.volume, display.inputSource]);

  const commandMutation = useMutation({
    mutationFn: (payload: DisplayCommandPayload) => displayApi.command(display.id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["displays"] });
      toast.success("Display updated");
    },
    onError: (error: Error) => toast.error("Display command failed", { description: error.message }),
  });

  const refreshMutation = useMutation({
    mutationFn: () => displayApi.refresh(display.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["displays"] });
      toast.success("Display status refreshed");
    },
    onError: (error: Error) => toast.error("Refresh failed", { description: error.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => displayApi.delete(display.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["displays"] });
      toast.success("Display removed");
    },
    onError: (error: Error) => toast.error("Remove failed", { description: error.message }),
  });

  const online = display.status === "online";

  return (
    <div className="rounded-lg border border-slate-400/30 dark:border-slate-800 bg-slate-300/40 dark:bg-slate-900/50 p-4 space-y-4" data-testid={`card-display-${display.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Monitor className={online ? "w-4 h-4 text-cyan-500" : "w-4 h-4 text-slate-500"} />
            <h3 className="font-semibold truncate">{display.name}</h3>
          </div>
          <p className="text-xs text-muted-foreground mt-1">{DISPLAY_BRANDS.find((brand) => brand.value === display.brand)?.label || display.brand}</p>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={() => refreshMutation.mutate()} disabled={refreshMutation.isPending} data-testid={`button-refresh-display-${display.id}`}>
            <RefreshCw className="w-3 h-3" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => deleteMutation.mutate()} className="text-red-500 hover:text-red-600" data-testid={`button-delete-display-${display.id}`}>
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>

      <div className="rounded-md bg-slate-200/70 dark:bg-slate-950/60 px-3 py-2">
        <div className={`text-xs font-semibold ${online ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500"}`}>
          {online ? "Online" : "Offline"}
        </div>
        <div className="text-xs text-muted-foreground mt-1">{displayStatus(display)}</div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" size="sm" onClick={() => commandMutation.mutate({ command: "power_on" })} disabled={commandMutation.isPending}>
          <Power className="w-3 h-3 mr-1" /> On
        </Button>
        <Button variant="outline" size="sm" onClick={() => commandMutation.mutate({ command: "power_off" })} disabled={commandMutation.isPending}>
          <PowerOff className="w-3 h-3 mr-1" /> Off
        </Button>
        <Button variant="outline" size="sm" onClick={() => commandMutation.mutate({ command: "mute" })} disabled={commandMutation.isPending}>
          <VolumeX className="w-3 h-3 mr-1" /> Mute
        </Button>
        <Button variant="outline" size="sm" onClick={() => commandMutation.mutate({ command: "unmute" })} disabled={commandMutation.isPending}>
          <Volume2 className="w-3 h-3 mr-1" /> Unmute
        </Button>
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
        <div className="space-y-1">
          <Label className="text-xs">Volume</Label>
          <Input type="number" min={0} max={100} value={volume} onChange={(event) => setVolume(parseInt(event.target.value) || 0)} data-testid={`input-display-volume-${display.id}`} />
        </div>
        <Button size="sm" onClick={() => commandMutation.mutate({ command: "set_volume", value: volume })} disabled={commandMutation.isPending}>
          Set
        </Button>
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
        <div className="space-y-1">
          <Label className="text-xs">Input Source</Label>
          <Input value={inputSource} onChange={(event) => setInputSource(event.target.value)} placeholder="HDMI1" data-testid={`input-display-source-${display.id}`} />
        </div>
        <Button size="sm" onClick={() => commandMutation.mutate({ command: "set_input", value: inputSource })} disabled={commandMutation.isPending || !inputSource.trim()}>
          Set
        </Button>
      </div>
    </div>
  );
}

function SetupPanel() {
  const queryClient = useQueryClient();
  const [token, setToken] = useState("");
  const [brand, setBrand] = useState("samsung_frame");
  const [name, setName] = useState("Samsung Frame");
  const [ip, setIp] = useState("");
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [discovered, setDiscovered] = useState<SmartThingsDiscoveredDevice[]>([]);

  const discoveryMutation = useMutation({
    mutationFn: () => displayApi.discoverSmartThings(token),
    onSuccess: (result) => {
      setDiscovered(result.devices);
      toast.success(`Found ${result.devices.length} SmartThings device${result.devices.length === 1 ? "" : "s"}`);
    },
    onError: (error: Error) => toast.error("SmartThings discovery failed", { description: error.message }),
  });

  const createMutation = useMutation({
    mutationFn: () => displayApi.create({
      name: name.trim() || "Samsung Frame",
      brand,
      ip: ip.trim() || null,
      protocol: "smartthings",
      smartthingsDeviceId: selectedDeviceId || null,
      smartthingsToken: token.trim() || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["displays"] });
      setName("Samsung Frame");
      setIp("");
      setSelectedDeviceId("");
      toast.success("Display added");
    },
    onError: (error: Error) => toast.error("Display add failed", { description: error.message }),
  });

  function selectDevice(deviceId: string) {
    setSelectedDeviceId(deviceId);
    const device = discovered.find((candidate) => candidate.deviceId === deviceId);
    if (device) setName(device.label || device.name || "Samsung Frame");
  }

  return (
    <div className="rounded-lg border border-slate-400/30 dark:border-slate-800 bg-slate-300/40 dark:bg-slate-900/50 p-4 space-y-4">
      <div>
        <h3 className="font-semibold flex items-center gap-2"><Plus className="w-4 h-4 text-cyan-500" /> Add SmartThings Display</h3>
        <p className="text-xs text-muted-foreground mt-1">Use a SmartThings personal access token with device read and control permissions.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 items-end">
        <div className="space-y-1">
          <Label>SmartThings Token</Label>
          <Input type="password" value={token} onChange={(event) => setToken(event.target.value)} placeholder="Paste token" data-testid="input-smartthings-token" />
        </div>
        <Button onClick={() => discoveryMutation.mutate()} disabled={discoveryMutation.isPending || token.trim().length < 10} data-testid="button-discover-displays">
          <Search className="w-4 h-4 mr-2" /> {discoveryMutation.isPending ? "Finding..." : "Find TVs"}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Brand</Label>
          <Select value={brand} onValueChange={setBrand}>
            <SelectTrigger data-testid="select-display-brand"><SelectValue /></SelectTrigger>
            <SelectContent>
              {DISPLAY_BRANDS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>SmartThings Device</Label>
          <Select value={selectedDeviceId || "_manual"} onValueChange={(value) => selectDevice(value === "_manual" ? "" : value)}>
            <SelectTrigger data-testid="select-smartthings-device"><SelectValue placeholder="Choose discovered device" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_manual">Manual device id</SelectItem>
              {discovered.map((device) => (
                <SelectItem key={device.deviceId} value={device.deviceId}>{device.label || device.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Name</Label>
          <Input value={name} onChange={(event) => setName(event.target.value)} data-testid="input-display-name" />
        </div>
        <div className="space-y-1">
          <Label>IP Address</Label>
          <Input value={ip} onChange={(event) => setIp(event.target.value)} placeholder="Optional" data-testid="input-display-ip" />
        </div>
      </div>

      <div className="space-y-1">
        <Label>SmartThings Device ID</Label>
        <Input value={selectedDeviceId} onChange={(event) => setSelectedDeviceId(event.target.value)} placeholder="Device UUID" data-testid="input-smartthings-device-id" />
      </div>

      {discovered.length > 0 && (
        <div className="text-xs text-muted-foreground">
          Discovery returned {discovered.length} device{discovered.length === 1 ? "" : "s"}. Pick the TV, then add it.
        </div>
      )}

      <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !token.trim() || !selectedDeviceId.trim()} data-testid="button-add-display">
        <Plus className="w-4 h-4 mr-2" /> {createMutation.isPending ? "Adding..." : "Add Display"}
      </Button>
    </div>
  );
}

export default function DisplaysPage() {
  const { data: displays = [] } = useQuery({
    queryKey: ["displays"],
    queryFn: displayApi.getAll,
  });

  return (
    <AppLayout activePage="/displays">
      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Monitor className="w-5 h-5 text-cyan-500" /> Displays
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Control Samsung Frame TVs and other SmartThings displays from the same app that runs cameras, lights, scenes, and macros.
            </p>
          </div>

          <SetupPanel />

          {displays.length === 0 ? (
            <div className="rounded-lg border-2 border-dashed border-slate-400/40 dark:border-slate-800 p-12 text-center">
              <Monitor className="w-10 h-10 mx-auto text-slate-500 mb-3" />
              <p className="text-sm text-muted-foreground">No displays configured yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {displays.map((display) => <DisplayCard key={display.id} display={display} />)}
            </div>
          )}
        </div>
      </main>
    </AppLayout>
  );
}
