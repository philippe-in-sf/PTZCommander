import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ThemeToggle } from "@/components/theme-toggle";
import { LayoutSelector } from "@/components/layouts/layout-selector";
import { LogViewer } from "@/components/logs/log-viewer";
import { ChangelogDialog } from "@/components/changelog-dialog";
import { Link } from "wouter";
import { Plus, Trash2, Wifi, WifiOff, Lightbulb, Layers, Palette, RefreshCw, Power, PowerOff, LinkIcon } from "lucide-react";
import type { HueBridge } from "@shared/schema";

interface HueLight {
  id: string; name: string; on: boolean; brightness: number;
  colorTemp?: number; reachable: boolean; type: string;
}
interface HueGroup { id: string; name: string; type: string; lights: string[]; on: boolean; brightness: number; }
interface HueScene { id: string; name: string; group?: string; lights: string[]; }

function BridgeSetup({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState("");
  const [ip, setIp] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  async function addBridge() {
    if (!name.trim() || !ip.trim()) { toast({ title: "Name and IP are required", variant: "destructive" }); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/hue/bridges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, ip, apiKey: apiKey || undefined }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      qc.invalidateQueries({ queryKey: ["/api/hue/bridges"] });
      toast({ title: "Bridge added" });
      onAdded();
    } catch (e: any) {
      toast({ title: "Failed to add bridge", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-slate-600 dark:text-slate-300">Bridge Name</Label>
          <Input data-testid="input-bridge-name" value={name} onChange={e => setName(e.target.value)} placeholder="Studio Hue" />
        </div>
        <div className="space-y-1">
          <Label className="text-slate-600 dark:text-slate-300">Bridge IP Address</Label>
          <Input data-testid="input-bridge-ip" value={ip} onChange={e => setIp(e.target.value)} placeholder="192.168.1.100" />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-slate-600 dark:text-slate-300">API Key (optional — leave blank to pair via button)</Label>
        <Input data-testid="input-bridge-apikey" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Paste existing API key, or leave blank" />
      </div>
      <Button data-testid="button-add-bridge" onClick={addBridge} disabled={loading} className="w-full">
        <Plus className="w-4 h-4 mr-2" />{loading ? "Adding..." : "Add Bridge"}
      </Button>
    </div>
  );
}

function BridgeCard({ bridge, onSelect }: { bridge: HueBridge; onSelect: () => void }) {
  const [pairing, setPairing] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  async function pair() {
    setPairing(true);
    try {
      const res = await fetch(`/api/hue/bridges/${bridge.id}/pair`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      qc.invalidateQueries({ queryKey: ["/api/hue/bridges"] });
      toast({ title: "Paired successfully!" });
    } catch (e: any) {
      toast({ title: "Pairing failed", description: e.message, variant: "destructive" });
    } finally { setPairing(false); }
  }

  async function deleteBridge() {
    await fetch(`/api/hue/bridges/${bridge.id}`, { method: "DELETE" });
    qc.invalidateQueries({ queryKey: ["/api/hue/bridges"] });
    toast({ title: "Bridge removed" });
  }

  const online = bridge.status === "online";

  return (
    <div
      className={`relative p-4 rounded-lg border-2 cursor-pointer transition-all ${
        online
          ? "border-yellow-500/60 bg-yellow-500/10 dark:bg-yellow-500/10"
          : "border-slate-600/40 bg-slate-200/60 dark:bg-slate-800/60"
      }`}
      onClick={online ? onSelect : undefined}
      data-testid={`card-bridge-${bridge.id}`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {online ? (
            <Wifi className="w-4 h-4 text-yellow-500" />
          ) : (
            <WifiOff className="w-4 h-4 text-slate-400" />
          )}
          <span className="font-semibold text-slate-800 dark:text-slate-100">{bridge.name}</span>
        </div>
        <div className="flex gap-1">
          {!bridge.apiKey && (
            <Button
              data-testid={`button-pair-bridge-${bridge.id}`}
              size="sm" variant="outline" onClick={e => { e.stopPropagation(); pair(); }}
              disabled={pairing}
              className="text-xs"
            >
              <LinkIcon className="w-3 h-3 mr-1" />{pairing ? "Pairing..." : "Pair"}
            </Button>
          )}
          <Button
            data-testid={`button-delete-bridge-${bridge.id}`}
            size="sm" variant="ghost" onClick={e => { e.stopPropagation(); deleteBridge(); }}
            className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>
      <div className="text-xs text-slate-500 dark:text-slate-400">{bridge.ip}</div>
      <div className={`text-xs font-medium mt-1 ${online ? "text-yellow-600 dark:text-yellow-400" : "text-slate-400"}`}>
        {online ? "Online" : bridge.apiKey ? "Offline" : "Not paired"}
      </div>
      {online && (
        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Click to control →</div>
      )}
    </div>
  );
}

function LightControl({ bridgeId, light }: { bridgeId: number; light: HueLight }) {
  const [brightness, setBrightness] = useState(light.brightness);
  const { toast } = useToast();
  const qc = useQueryClient();

  async function setOn(on: boolean) {
    await fetch(`/api/hue/bridges/${bridgeId}/lights/${light.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ on }),
    });
    qc.invalidateQueries({ queryKey: [`/api/hue/bridges/${bridgeId}/lights`] });
  }

  async function applyBrightness(bri: number) {
    await fetch(`/api/hue/bridges/${bridgeId}/lights/${light.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ on: true, bri }),
    });
    qc.invalidateQueries({ queryKey: [`/api/hue/bridges/${bridgeId}/lights`] });
  }

  return (
    <div className={`p-3 rounded-lg border transition-all ${
      light.on
        ? "border-yellow-500/60 bg-yellow-500/10 dark:bg-yellow-900/30"
        : "border-slate-600/30 bg-slate-200/50 dark:bg-slate-800/50"
    } ${!light.reachable ? "opacity-50" : ""}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Lightbulb className={`w-4 h-4 ${light.on ? "text-yellow-500" : "text-slate-400"}`} />
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate max-w-[120px]">{light.name}</span>
        </div>
        <button
          data-testid={`button-toggle-light-${light.id}`}
          onClick={() => setOn(!light.on)}
          disabled={!light.reachable}
          className={`p-1.5 rounded transition-colors ${
            light.on ? "bg-yellow-500 hover:bg-yellow-600 text-black" : "bg-slate-600 hover:bg-slate-500 text-white"
          }`}
        >
          {light.on ? <Power className="w-3.5 h-3.5" /> : <PowerOff className="w-3.5 h-3.5" />}
        </button>
      </div>
      {light.on && (
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs text-slate-500 dark:text-slate-400 w-4">☀</span>
          <Slider
            data-testid={`slider-brightness-light-${light.id}`}
            min={1} max={254}
            value={[brightness]}
            onValueChange={([v]) => setBrightness(v)}
            onValueCommit={([v]) => applyBrightness(v)}
            className="flex-1"
          />
          <span className="text-xs text-slate-500 dark:text-slate-400 w-8 text-right">{Math.round(brightness / 254 * 100)}%</span>
        </div>
      )}
      {!light.reachable && (
        <div className="text-xs text-red-400 mt-1">Unreachable</div>
      )}
    </div>
  );
}

function GroupControl({ bridgeId, group }: { bridgeId: number; group: HueGroup }) {
  const [brightness, setBrightness] = useState(group.brightness);
  const qc = useQueryClient();

  async function setOn(on: boolean) {
    await fetch(`/api/hue/bridges/${bridgeId}/groups/${group.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ on }),
    });
    qc.invalidateQueries({ queryKey: [`/api/hue/bridges/${bridgeId}/groups`] });
  }

  async function applyBrightness(bri: number) {
    await fetch(`/api/hue/bridges/${bridgeId}/groups/${group.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ on: true, bri }),
    });
    qc.invalidateQueries({ queryKey: [`/api/hue/bridges/${bridgeId}/groups`] });
  }

  return (
    <div className={`p-3 rounded-lg border transition-all ${
      group.on
        ? "border-yellow-500/60 bg-yellow-500/10 dark:bg-yellow-900/30"
        : "border-slate-600/30 bg-slate-200/50 dark:bg-slate-800/50"
    }`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Layers className={`w-4 h-4 ${group.on ? "text-yellow-500" : "text-slate-400"}`} />
          <div>
            <div className="text-sm font-medium text-slate-700 dark:text-slate-200">{group.name}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">{group.lights.length} light{group.lights.length !== 1 ? "s" : ""} · {group.type}</div>
          </div>
        </div>
        <button
          data-testid={`button-toggle-group-${group.id}`}
          onClick={() => setOn(!group.on)}
          className={`p-1.5 rounded transition-colors ${
            group.on ? "bg-yellow-500 hover:bg-yellow-600 text-black" : "bg-slate-600 hover:bg-slate-500 text-white"
          }`}
        >
          {group.on ? <Power className="w-3.5 h-3.5" /> : <PowerOff className="w-3.5 h-3.5" />}
        </button>
      </div>
      <div className="flex items-center gap-2 mt-2">
        <span className="text-xs text-slate-500 dark:text-slate-400 w-4">☀</span>
        <Slider
          data-testid={`slider-brightness-group-${group.id}`}
          min={1} max={254}
          value={[brightness]}
          onValueChange={([v]) => setBrightness(v)}
          onValueCommit={([v]) => applyBrightness(v)}
          className="flex-1"
        />
        <span className="text-xs text-slate-500 dark:text-slate-400 w-8 text-right">{Math.round(brightness / 254 * 100)}%</span>
      </div>
    </div>
  );
}

function SceneList({ bridgeId, groups }: { bridgeId: number; groups: HueGroup[] }) {
  const { data: scenes = [], isLoading } = useQuery<HueScene[]>({
    queryKey: [`/api/hue/bridges/${bridgeId}/scenes`],
    enabled: !!bridgeId,
  });
  const { toast } = useToast();

  async function activateScene(scene: HueScene) {
    const groupId = scene.group;
    const body = groupId ? { groupId } : {};
    const res = await fetch(`/api/hue/bridges/${bridgeId}/scenes/${scene.id}/activate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) { toast({ title: `Scene "${scene.name}" activated` }); }
    else { toast({ title: "Failed to activate scene", variant: "destructive" }); }
  }

  if (isLoading) return <div className="text-sm text-slate-400 p-4">Loading scenes...</div>;
  if (!scenes.length) return <div className="text-sm text-slate-400 p-4">No scenes found.</div>;

  const grouped: Record<string, HueScene[]> = {};
  for (const s of scenes) {
    const key = s.group ? (groups.find(g => g.id === s.group)?.name ?? `Group ${s.group}`) : "All Lights";
    (grouped[key] ??= []).push(s);
  }

  return (
    <div className="space-y-4">
      {Object.entries(grouped).map(([groupName, gScenes]) => (
        <div key={groupName}>
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 px-1">{groupName}</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {gScenes.map(scene => (
              <button
                key={scene.id}
                data-testid={`button-scene-${scene.id}`}
                onClick={() => activateScene(scene)}
                className="p-3 rounded-lg border border-slate-600/30 bg-slate-200/50 dark:bg-slate-800/50 hover:border-yellow-500/50 hover:bg-yellow-500/10 dark:hover:bg-yellow-900/20 transition-all text-left"
              >
                <Palette className="w-4 h-4 text-yellow-500 mb-1.5" />
                <div className="text-sm font-medium text-slate-700 dark:text-slate-200 leading-tight">{scene.name}</div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function BridgeControlPanel({ bridge }: { bridge: HueBridge }) {
  const qc = useQueryClient();
  const { data: lights = [], isLoading: lightsLoading } = useQuery<HueLight[]>({
    queryKey: [`/api/hue/bridges/${bridge.id}/lights`],
    refetchInterval: 10000,
  });
  const { data: groups = [], isLoading: groupsLoading } = useQuery<HueGroup[]>({
    queryKey: [`/api/hue/bridges/${bridge.id}/groups`],
    refetchInterval: 10000,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <Wifi className="w-5 h-5 text-yellow-500" />
          {bridge.name}
        </h2>
        <Button
          data-testid="button-refresh-hue"
          size="sm" variant="outline"
          onClick={() => {
            qc.invalidateQueries({ queryKey: [`/api/hue/bridges/${bridge.id}/lights`] });
            qc.invalidateQueries({ queryKey: [`/api/hue/bridges/${bridge.id}/groups`] });
          }}
        >
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Refresh
        </Button>
      </div>
      <Tabs defaultValue="scenes">
        <TabsList className="bg-slate-300/60 dark:bg-slate-700/60">
          <TabsTrigger value="scenes" data-testid="tab-scenes">Scenes</TabsTrigger>
          <TabsTrigger value="groups" data-testid="tab-groups">Rooms & Zones</TabsTrigger>
          <TabsTrigger value="lights" data-testid="tab-lights">Individual Lights</TabsTrigger>
        </TabsList>

        <TabsContent value="scenes" className="mt-4">
          <SceneList bridgeId={bridge.id} groups={groups} />
        </TabsContent>

        <TabsContent value="groups" className="mt-4">
          {groupsLoading ? (
            <div className="text-sm text-slate-400 p-4">Loading rooms...</div>
          ) : groups.length === 0 ? (
            <div className="text-sm text-slate-400 p-4">No rooms or zones found.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {groups.map(g => <GroupControl key={g.id} bridgeId={bridge.id} group={g} />)}
            </div>
          )}
        </TabsContent>

        <TabsContent value="lights" className="mt-4">
          {lightsLoading ? (
            <div className="text-sm text-slate-400 p-4">Loading lights...</div>
          ) : lights.length === 0 ? (
            <div className="text-sm text-slate-400 p-4">No lights found.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {lights.map(l => <LightControl key={l.id} bridgeId={bridge.id} light={l} />)}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function LightingPage() {
  const { data: bridges = [], isLoading } = useQuery<HueBridge[]>({
    queryKey: ["/api/hue/bridges"],
  });
  const [selectedBridgeId, setSelectedBridgeId] = useState<number | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);

  const selectedBridge = bridges.find(b => b.id === selectedBridgeId) ?? bridges.find(b => b.status === "online") ?? null;

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-slate-100">
      <header className="sticky top-0 z-50 bg-slate-200/90 dark:bg-slate-900/90 border-b border-slate-300/60 dark:border-slate-700/60 backdrop-blur-sm px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="font-bold tracking-tight text-lg leading-none">
              PTZ<span className="text-cyan-500 font-light">COMMAND</span>
            </h1>
            <ChangelogDialog />
          </div>
          <nav className="flex items-center gap-1 ml-6">
            <Link href="/"><button className="px-3 py-1.5 rounded text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-400/50 dark:hover:bg-slate-800 transition-colors" data-testid="nav-dashboard">Dashboard</button></Link>
            <Link href="/scenes"><button className="px-3 py-1.5 rounded text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-400/50 dark:hover:bg-slate-800 transition-colors" data-testid="nav-scenes">Scenes</button></Link>
            <Link href="/macros"><button className="px-3 py-1.5 rounded text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-400/50 dark:hover:bg-slate-800 transition-colors" data-testid="nav-macros">Macros</button></Link>
            <Link href="/switcher"><button className="px-3 py-1.5 rounded text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-400/50 dark:hover:bg-slate-800 transition-colors" data-testid="nav-switcher">Video Switcher</button></Link>
            <Link href="/mixer"><button className="px-3 py-1.5 rounded text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-400/50 dark:hover:bg-slate-800 transition-colors" data-testid="nav-mixer">Audio Mixer</button></Link>
            <button className="px-3 py-1.5 rounded text-sm font-medium text-slate-900 dark:text-white bg-slate-400/70 dark:bg-slate-800 border border-slate-400 dark:border-slate-700" data-testid="nav-lighting">Lighting</button>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <LayoutSelector />
          <LogViewer />
          <ThemeToggle />
        </div>
      </header>

      <div className="p-4 max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between pt-2">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Lighting Control</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Philips Hue bridge management and light control</p>
          </div>
          <Button data-testid="button-add-bridge-open" onClick={() => setShowAddDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />Add Bridge
          </Button>
        </div>

        {isLoading && (
          <div className="text-sm text-slate-400 p-8 text-center">Loading bridges...</div>
        )}

        {!isLoading && bridges.length === 0 && (
          <div className="text-center py-16">
            <Lightbulb className="w-12 h-12 text-slate-400 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-slate-600 dark:text-slate-300 mb-2">No Hue Bridges Yet</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 max-w-md mx-auto">
              Add your Philips Hue bridge to control lights from this interface. You'll need the bridge IP address.
            </p>
            <Button onClick={() => setShowAddDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />Add Your First Bridge
            </Button>
          </div>
        )}

        {bridges.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {bridges.map(b => (
              <BridgeCard
                key={b.id}
                bridge={b}
                onSelect={() => setSelectedBridgeId(b.id)}
              />
            ))}
          </div>
        )}

        {selectedBridge && selectedBridge.status === "online" && (
          <div className="bg-slate-200/80 dark:bg-slate-800/80 rounded-xl border border-slate-300/60 dark:border-slate-700/60 p-5">
            <BridgeControlPanel bridge={selectedBridge} />
          </div>
        )}
      </div>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Hue Bridge</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">
            Enter your bridge's IP and an existing API key, or leave the API key blank and use the <strong>Pair</strong> button (press the link button on the bridge first).
          </p>
          <BridgeSetup onAdded={() => setShowAddDialog(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
