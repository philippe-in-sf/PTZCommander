import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { displayApi, type DisplayCommandPayload, type HisenseDiscoveredDisplay, type SamsungDiscoveredDisplay, type SmartThingsDiscoveredDevice, type SmartThingsOAuthSession } from "@/lib/api";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Monitor, Plus, Power, PowerOff, RefreshCw, Search, Trash2, Volume2, VolumeX } from "lucide-react";
import type { DisplayDevice } from "@shared/schema";

type DisplayWithPairing = DisplayDevice & { paired?: boolean };

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

function DisplayCard({ display }: { display: DisplayWithPairing }) {
  const queryClient = useQueryClient();
  const [volume, setVolume] = useState(display.volume ?? 20);
  const [inputSource, setInputSource] = useState(display.inputSource ?? "");
  const [authCode, setAuthCode] = useState("");
  const isSamsungLocal = display.protocol === "samsung_local";
  const isHisenseLocal = display.protocol === "hisense_vidaa";
  const isLocalDisplay = isSamsungLocal || isHisenseLocal;

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

  const pairMutation = useMutation({
    mutationFn: () => displayApi.pair(display.id, isHisenseLocal ? { authCode: authCode.trim() } : undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["displays"] });
      setAuthCode("");
      toast.success("Display paired");
    },
    onError: (error: Error) => toast.error("Pairing failed", { description: error.message }),
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
          <p className="text-xs text-muted-foreground mt-1">
            {DISPLAY_BRANDS.find((brand) => brand.value === display.brand)?.label || display.brand}
            {isLocalDisplay ? " · Local network" : " · SmartThings"}
          </p>
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
        {isLocalDisplay && (
          <div className="text-xs text-muted-foreground mt-1">
            {display.paired ? "Paired for remote control" : isHisenseLocal ? "Pair if the TV asks for a 4-digit code" : "Pair once, then accept the prompt on the TV"}
          </div>
        )}
      </div>

      {isLocalDisplay ? (
        <>
          {isHisenseLocal && !display.paired && (
            <div className="space-y-1">
              <Label className="text-xs">Auth Code</Label>
              <Input value={authCode} onChange={(event) => setAuthCode(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="Optional 4-digit code" data-testid={`input-display-auth-code-${display.id}`} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" onClick={() => pairMutation.mutate()} disabled={pairMutation.isPending}>
              {pairMutation.isPending ? "Pairing..." : display.paired ? "Pair Again" : "Pair"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => commandMutation.mutate({ command: "power_toggle" })} disabled={commandMutation.isPending}>
              <Power className="w-3 h-3 mr-1" /> Power
            </Button>
            <Button variant="outline" size="sm" onClick={() => commandMutation.mutate({ command: "volume_down" })} disabled={commandMutation.isPending}>
              Vol -
            </Button>
            <Button variant="outline" size="sm" onClick={() => commandMutation.mutate({ command: "volume_up" })} disabled={commandMutation.isPending}>
              Vol +
            </Button>
            <Button variant="outline" size="sm" onClick={() => commandMutation.mutate({ command: "mute" })} disabled={commandMutation.isPending}>
              <VolumeX className="w-3 h-3 mr-1" /> Mute
            </Button>
            <Button variant="outline" size="sm" onClick={() => commandMutation.mutate({ command: "set_input", value: inputSource || "HDMI1" })} disabled={commandMutation.isPending}>
              HDMI
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
        </>
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}

function LocalSamsungSetupPanel() {
  const queryClient = useQueryClient();
  const [manualName, setManualName] = useState("Samsung Frame");
  const [manualIp, setManualIp] = useState("");
  const [manualPort, setManualPort] = useState("8002");
  const [discovered, setDiscovered] = useState<SamsungDiscoveredDisplay[]>([]);

  const discoveryMutation = useMutation({
    mutationFn: () => displayApi.discoverSamsung(),
    onSuccess: (result) => {
      setDiscovered(result.displays);
      toast.success(`Found ${result.displays.length} Samsung TV${result.displays.length === 1 ? "" : "s"}`);
    },
    onError: (error: Error) => toast.error("Samsung discovery failed", { description: error.message }),
  });

  const createMutation = useMutation({
    mutationFn: (display: { name: string; ip: string; port: number; modelName?: string }) => displayApi.create({
      name: display.name,
      brand: "samsung_frame",
      ip: display.ip,
      protocol: "samsung_local",
      samsungPort: display.port,
      samsungModel: display.modelName || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["displays"] });
      setManualIp("");
      toast.success("Display added. Pair it once and accept the prompt on the TV.");
    },
    onError: (error: Error) => toast.error("Display add failed", { description: error.message }),
  });

  function addManual() {
    createMutation.mutate({
      name: manualName.trim() || "Samsung Frame",
      ip: manualIp.trim(),
      port: parseInt(manualPort, 10) || 8002,
    });
  }

  function addDiscovered(display: SamsungDiscoveredDisplay) {
    createMutation.mutate({
      name: display.name || `Samsung TV ${display.ip}`,
      ip: display.ip,
      port: display.port || 8002,
      modelName: display.modelName,
    });
  }

  return (
    <div className="rounded-lg border border-slate-400/30 dark:border-slate-800 bg-slate-300/40 dark:bg-slate-900/50 p-4 space-y-4">
      <div>
        <h3 className="font-semibold flex items-center gap-2"><Plus className="w-4 h-4 text-cyan-500" /> Add Samsung TV</h3>
        <p className="text-xs text-muted-foreground mt-1">Find Samsung TVs on the local network, add one, then pair once from the TV prompt.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => discoveryMutation.mutate()} disabled={discoveryMutation.isPending} data-testid="button-discover-samsung-displays">
          <Search className="w-4 h-4 mr-2" /> {discoveryMutation.isPending ? "Finding..." : "Find Samsung TVs"}
        </Button>
        <span className="self-center text-xs text-muted-foreground">Works without SmartThings accounts or cloud tokens.</span>
      </div>

      {discovered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {discovered.map((display) => (
            <div key={`${display.ip}:${display.port}`} className="rounded-md border border-slate-400/30 dark:border-slate-800 bg-slate-200/60 dark:bg-slate-950/40 p-3 space-y-2">
              <div>
                <div className="text-sm font-medium">{display.name}</div>
                <div className="text-xs text-muted-foreground">{display.ip}:{display.port}{display.modelName ? ` · ${display.modelName}` : ""}</div>
              </div>
              <Button size="sm" onClick={() => addDiscovered(display)} disabled={createMutation.isPending || display.alreadyConfigured}>
                {display.alreadyConfigured ? "Already Added" : "Add TV"}
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_120px_auto] gap-3 items-end">
        <div className="space-y-1">
          <Label>Name</Label>
          <Input value={manualName} onChange={(event) => setManualName(event.target.value)} data-testid="input-display-name" />
        </div>
        <div className="space-y-1">
          <Label>IP Address</Label>
          <Input value={manualIp} onChange={(event) => setManualIp(event.target.value)} placeholder="192.168.0.50" data-testid="input-display-ip" />
        </div>
        <div className="space-y-1">
          <Label>Port</Label>
          <Input value={manualPort} onChange={(event) => setManualPort(event.target.value)} placeholder="8002" data-testid="input-display-port" />
        </div>
        <Button onClick={addManual} disabled={createMutation.isPending || !manualIp.trim()} data-testid="button-add-display">
          <Plus className="w-4 h-4 mr-2" /> Add
        </Button>
      </div>
    </div>
  );
}

function LocalHisenseSetupPanel() {
  const queryClient = useQueryClient();
  const [manualName, setManualName] = useState("Hisense Canvas");
  const [manualIp, setManualIp] = useState("");
  const [manualPort, setManualPort] = useState("36669");
  const [manualUseSsl, setManualUseSsl] = useState("true");
  const [discovered, setDiscovered] = useState<HisenseDiscoveredDisplay[]>([]);

  const discoveryMutation = useMutation({
    mutationFn: () => displayApi.discoverHisense(),
    onSuccess: (result) => {
      setDiscovered(result.displays);
      toast.success(`Found ${result.displays.length} Hisense TV${result.displays.length === 1 ? "" : "s"}`);
    },
    onError: (error: Error) => toast.error("Hisense discovery failed", { description: error.message }),
  });

  const createMutation = useMutation({
    mutationFn: (display: { name: string; ip: string; port: number; useSsl: boolean; modelName?: string }) => displayApi.create({
      name: display.name,
      brand: "hisense_canvas",
      ip: display.ip,
      protocol: "hisense_vidaa",
      hisensePort: display.port,
      hisenseUseSsl: display.useSsl,
      hisenseUsername: "hisenseservice",
      hisensePassword: "multimqttservice",
      hisenseClientName: "PTZCommander",
      hisenseModel: display.modelName || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["displays"] });
      setManualIp("");
      toast.success("Canvas TV added. Pair it if the TV asks for a code.");
    },
    onError: (error: Error) => toast.error("Canvas add failed", { description: error.message }),
  });

  function addManual() {
    createMutation.mutate({
      name: manualName.trim() || "Hisense Canvas",
      ip: manualIp.trim(),
      port: parseInt(manualPort, 10) || 36669,
      useSsl: manualUseSsl === "true",
    });
  }

  function addDiscovered(display: HisenseDiscoveredDisplay) {
    createMutation.mutate({
      name: display.name || `Hisense Canvas ${display.ip}`,
      ip: display.ip,
      port: display.port || 36669,
      useSsl: display.useSsl !== false,
      modelName: display.modelName,
    });
  }

  return (
    <div className="rounded-lg border border-slate-400/30 dark:border-slate-800 bg-slate-300/40 dark:bg-slate-900/50 p-4 space-y-4">
      <div>
        <h3 className="font-semibold flex items-center gap-2"><Plus className="w-4 h-4 text-cyan-500" /> Add Hisense Canvas TV</h3>
        <p className="text-xs text-muted-foreground mt-1">Find VIDAA-based Hisense TVs on the local network, then pair with the TV code only if prompted.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => discoveryMutation.mutate()} disabled={discoveryMutation.isPending} data-testid="button-discover-hisense-displays">
          <Search className="w-4 h-4 mr-2" /> {discoveryMutation.isPending ? "Finding..." : "Find Canvas TVs"}
        </Button>
        <span className="self-center text-xs text-muted-foreground">Uses VIDAA local MQTT on port 36669.</span>
      </div>

      {discovered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {discovered.map((display) => (
            <div key={`${display.ip}:${display.port}`} className="rounded-md border border-slate-400/30 dark:border-slate-800 bg-slate-200/60 dark:bg-slate-950/40 p-3 space-y-2">
              <div>
                <div className="text-sm font-medium">{display.name}</div>
                <div className="text-xs text-muted-foreground">{display.ip}:{display.port}{display.modelName ? ` · ${display.modelName}` : ""}</div>
              </div>
              <Button size="sm" onClick={() => addDiscovered(display)} disabled={createMutation.isPending || display.alreadyConfigured}>
                {display.alreadyConfigured ? "Already Added" : "Add TV"}
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_120px_140px_auto] gap-3 items-end">
        <div className="space-y-1">
          <Label>Name</Label>
          <Input value={manualName} onChange={(event) => setManualName(event.target.value)} data-testid="input-hisense-display-name" />
        </div>
        <div className="space-y-1">
          <Label>IP Address</Label>
          <Input value={manualIp} onChange={(event) => setManualIp(event.target.value)} placeholder="192.168.0.60" data-testid="input-hisense-display-ip" />
        </div>
        <div className="space-y-1">
          <Label>Port</Label>
          <Input value={manualPort} onChange={(event) => setManualPort(event.target.value)} placeholder="36669" data-testid="input-hisense-display-port" />
        </div>
        <div className="space-y-1">
          <Label>Transport</Label>
          <Select value={manualUseSsl} onValueChange={setManualUseSsl}>
            <SelectTrigger data-testid="select-hisense-transport"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="true">Encrypted</SelectItem>
              <SelectItem value="false">Plain</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={addManual} disabled={createMutation.isPending || !manualIp.trim()} data-testid="button-add-hisense-display">
          <Plus className="w-4 h-4 mr-2" /> Add
        </Button>
      </div>
    </div>
  );
}

function AdvancedSmartThingsSetup() {
  const queryClient = useQueryClient();
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [scope, setScope] = useState("r:devices:* x:devices:* r:locations:*");
  const [oauthSession, setOauthSession] = useState<SmartThingsOAuthSession | null>(null);
  const [redirectUri, setRedirectUri] = useState(() => (
    typeof window !== "undefined"
      ? `${window.location.origin}/api/displays/smartthings/oauth/callback`
      : ""
  ));
  const [brand, setBrand] = useState("samsung_frame");
  const [name, setName] = useState("Samsung Frame");
  const [ip, setIp] = useState("");
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [discovered, setDiscovered] = useState<SmartThingsDiscoveredDevice[]>([]);
  const redirectUriIsHttps = redirectUri.trim().startsWith("https://");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const state = params.get("smartthingsAuth");
    if (!state) return;
    displayApi.getSmartThingsOAuthSession(state)
      .then((session) => {
        setOauthSession(session);
        setClientId(session.clientId);
        setClientSecret(session.clientSecret);
        toast.success("SmartThings authorization complete");
        window.history.replaceState({}, "", "/displays");
      })
      .catch((error: Error) => toast.error("SmartThings authorization failed", { description: error.message }));
  }, []);

  const oauthMutation = useMutation({
    mutationFn: () => displayApi.startSmartThingsOAuth({ clientId, clientSecret, redirectUri, scope }),
    onSuccess: (result) => {
      window.location.href = result.authorizeUrl;
    },
    onError: (error: Error) => toast.error("SmartThings authorization failed", { description: error.message }),
  });

  const discoveryMutation = useMutation({
    mutationFn: () => displayApi.discoverSmartThings(oauthSession?.accessToken || ""),
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
      smartthingsToken: oauthSession?.accessToken || null,
      smartthingsRefreshToken: oauthSession?.refreshToken || null,
      smartthingsTokenExpiresAt: oauthSession?.expiresAt ? new Date(oauthSession.expiresAt) : null,
      smartthingsClientId: oauthSession?.clientId || clientId || null,
      smartthingsClientSecret: oauthSession?.clientSecret || clientSecret || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["displays"] });
      setName("Samsung Frame");
      setIp("");
      setSelectedDeviceId("");
      setDiscovered([]);
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
    <details className="rounded-lg border border-slate-400/30 dark:border-slate-800 bg-slate-300/30 dark:bg-slate-900/40 p-4">
      <summary className="cursor-pointer text-sm font-semibold">Advanced: SmartThings cloud setup</summary>
      <div className="pt-4 space-y-4">
        <div>
          <h3 className="font-semibold flex items-center gap-2"><Plus className="w-4 h-4 text-cyan-500" /> Add SmartThings Display</h3>
          <p className="text-xs text-muted-foreground mt-1">Use this when local Samsung control is not available or when a TV only exposes SmartThings controls.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>OAuth Client ID</Label>
            <Input value={clientId} onChange={(event) => setClientId(event.target.value)} placeholder="SmartThings app client ID" data-testid="input-smartthings-client-id" />
          </div>
          <div className="space-y-1">
            <Label>OAuth Client Secret</Label>
            <Input type="password" value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} placeholder="SmartThings app client secret" data-testid="input-smartthings-client-secret" />
          </div>
        </div>
        <div className="space-y-1">
          <Label>Redirect URI</Label>
          <Input value={redirectUri} onChange={(event) => setRedirectUri(event.target.value)} data-testid="input-smartthings-redirect-uri" />
          <p className="text-[11px] text-muted-foreground">Add this exact URI to your SmartThings OAuth app.</p>
          {!redirectUriIsHttps && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              SmartThings requires an HTTPS redirect URI. Use an HTTPS tunnel or reverse proxy, then paste that callback URL here.
            </p>
          )}
        </div>
        <div className="space-y-1">
          <Label>OAuth Scopes</Label>
          <Input value={scope} onChange={(event) => setScope(event.target.value)} data-testid="input-smartthings-scopes" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => oauthMutation.mutate()} disabled={oauthMutation.isPending || !clientId.trim() || !clientSecret.trim() || !redirectUriIsHttps} data-testid="button-authorize-smartthings">
            {oauthMutation.isPending ? "Opening..." : oauthSession ? "Reconnect SmartThings" : "Connect SmartThings"}
          </Button>
          <Button variant="outline" onClick={() => discoveryMutation.mutate()} disabled={discoveryMutation.isPending || !oauthSession?.accessToken} data-testid="button-discover-displays">
            <Search className="w-4 h-4 mr-2" /> {discoveryMutation.isPending ? "Finding..." : "Find TVs"}
          </Button>
          {oauthSession && (
            <span className="self-center text-xs text-emerald-600 dark:text-emerald-400">
              Authorized until {new Date(oauthSession.expiresAt).toLocaleTimeString()}
            </span>
          )}
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
            <Input value={name} onChange={(event) => setName(event.target.value)} data-testid="input-smartthings-display-name" />
          </div>
          <div className="space-y-1">
            <Label>IP Address</Label>
            <Input value={ip} onChange={(event) => setIp(event.target.value)} placeholder="Optional" data-testid="input-smartthings-display-ip" />
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

        <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !oauthSession?.accessToken || !selectedDeviceId.trim()} data-testid="button-add-smartthings-display">
          <Plus className="w-4 h-4 mr-2" /> {createMutation.isPending ? "Adding..." : "Add SmartThings Display"}
        </Button>
      </div>
    </details>
  );
}

export default function DisplaysPage() {
  const { data: displays = [] } = useQuery<DisplayWithPairing[]>({
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
              Control Samsung Frame TVs and other displays from the same app that runs cameras, lights, scenes, and macros.
            </p>
          </div>

          <LocalSamsungSetupPanel />
          <LocalHisenseSetupPanel />
          <AdvancedSmartThingsSetup />

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
