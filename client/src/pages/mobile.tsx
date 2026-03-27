import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cameraApi, sceneButtonApi, macroApi } from "@/lib/api";
import { useWebSocket } from "@/lib/websocket";
import { useTheme } from "@/components/theme-provider";
import { useAtemControl } from "@/hooks/use-atem-control";
import { APP_VERSION } from "@shared/version";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Sun, Moon, Play, Loader2 } from "lucide-react";
import type { Camera, Preset, SceneButton } from "@shared/schema";

interface HueBridge {
  id: number;
  name: string;
  ip: string;
  apiKey: string | null;
  status: string;
}

interface HueScene {
  id: string;
  name: string;
  type: string;
  group?: string;
}

interface HueGroup {
  id: string;
  name: string;
  type: string;
  state: { all_on: boolean; any_on: boolean };
  action: { on: boolean; bri: number };
}

interface HueLight {
  id: string;
  name: string;
  state: { on: boolean; bri?: number; reachable: boolean };
}

// ── Joystick ─────────────────────────────────────────────────────────────────

function MobileJoystick({
  cameraId,
  ws,
  speed,
}: {
  cameraId: number;
  ws: ReturnType<typeof useWebSocket>;
  speed: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const maxRadius = 60;

  const handleMove = useCallback(
    (clientX: number, clientY: number) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let dx = clientX - cx;
      let dy = clientY - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > maxRadius) {
        dx = (dx / dist) * maxRadius;
        dy = (dy / dist) * maxRadius;
      }
      setPos({ x: dx, y: dy });
      const pan = (dx / maxRadius) * speed;
      const tilt = (-dy / maxRadius) * speed;
      ws.panTilt(cameraId, pan, tilt, speed);
    },
    [cameraId, ws, speed]
  );

  const handleEnd = useCallback(() => {
    setActive(false);
    setPos({ x: 0, y: 0 });
    ws.panTiltStop(cameraId);
  }, [cameraId, ws]);

  const onTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    setActive(true);
    const t = e.touches[0];
    handleMove(t.clientX, t.clientY);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    if (!active) return;
    const t = e.touches[0];
    handleMove(t.clientX, t.clientY);
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        ref={containerRef}
        className="relative w-36 h-36 rounded-full bg-slate-300 dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-700 touch-none"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={handleEnd}
        onTouchCancel={handleEnd}
        data-testid="mobile-joystick"
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-px h-full bg-slate-400 dark:bg-slate-800" />
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-px w-full bg-slate-400 dark:bg-slate-800" />
        </div>
        <div
          className={cn(
            "absolute w-14 h-14 rounded-full transition-colors",
            active
              ? "bg-cyan-500/80 shadow-[0_0_20px_rgba(6,182,212,0.5)]"
              : "bg-slate-400 dark:bg-slate-700"
          )}
          style={{
            left: `calc(50% + ${pos.x}px - 28px)`,
            top: `calc(50% + ${pos.y}px - 28px)`,
            transition: active ? "none" : "all 0.2s ease-out",
          }}
        />
      </div>
      <span className="text-[10px] font-mono text-slate-500 dark:text-slate-600 uppercase">
        Pan / Tilt
      </span>
    </div>
  );
}

// ── Zoom + Focus controls ─────────────────────────────────────────────────────

function LensControls({
  cameraId,
  ws,
}: {
  cameraId: number;
  ws: ReturnType<typeof useWebSocket>;
}) {
  const btn =
    "w-14 h-10 rounded border text-xs font-bold active:scale-95 transition-all select-none touch-none " +
    "bg-slate-200 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white active:bg-cyan-700 active:text-white active:border-cyan-600";

  return (
    <div className="flex gap-3 items-center">
      {/* Zoom */}
      <div className="flex flex-col items-center gap-1">
        <button
          className={cn(btn, "rounded-t-lg rounded-b-none")}
          onTouchStart={() => ws.zoom(cameraId, 1, 0.4)}
          onTouchEnd={() => ws.zoom(cameraId, 0, 0)}
          onTouchCancel={() => ws.zoom(cameraId, 0, 0)}
          data-testid="mobile-zoom-in"
        >
          T
        </button>
        <span className="text-[9px] font-mono text-slate-500 dark:text-slate-600">ZOOM</span>
        <button
          className={cn(btn, "rounded-b-lg rounded-t-none")}
          onTouchStart={() => ws.zoom(cameraId, -1, 0.4)}
          onTouchEnd={() => ws.zoom(cameraId, 0, 0)}
          onTouchCancel={() => ws.zoom(cameraId, 0, 0)}
          data-testid="mobile-zoom-out"
        >
          W
        </button>
      </div>

      {/* Focus */}
      <div className="flex flex-col items-center gap-1">
        <button
          className={cn(btn, "rounded-t-lg rounded-b-none")}
          onTouchStart={() => ws.focusFar(cameraId, 0.5)}
          onTouchEnd={() => ws.focusStop(cameraId)}
          onTouchCancel={() => ws.focusStop(cameraId)}
          data-testid="mobile-focus-far"
        >
          Far
        </button>
        <span className="text-[9px] font-mono text-slate-500 dark:text-slate-600">FOCUS</span>
        <button
          className={cn(btn, "rounded-b-lg rounded-t-none")}
          onTouchStart={() => ws.focusNear(cameraId, 0.5)}
          onTouchEnd={() => ws.focusStop(cameraId)}
          onTouchCancel={() => ws.focusStop(cameraId)}
          data-testid="mobile-focus-near"
        >
          Near
        </button>
      </div>

      {/* Auto Focus */}
      <div className="flex flex-col items-center gap-1">
        <button
          className="w-14 h-[88px] rounded-lg border text-[10px] font-bold bg-slate-200 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 active:bg-cyan-700 active:text-white active:border-cyan-600 transition-all select-none"
          onClick={() => ws.focusAuto(cameraId)}
          data-testid="mobile-focus-auto"
        >
          AUTO<br />FOCUS
        </button>
      </div>
    </div>
  );
}

// ── Speed toggle ──────────────────────────────────────────────────────────────

function SpeedToggle({
  speed,
  onChange,
}: {
  speed: number;
  onChange: (s: number) => void;
}) {
  const levels = [
    { label: "Slow", value: 0.25 },
    { label: "Med", value: 0.5 },
    { label: "Fast", value: 1.0 },
  ];
  return (
    <div className="flex items-center gap-1">
      <span className="text-[9px] font-mono text-slate-500 dark:text-slate-600 uppercase mr-1">Speed</span>
      {levels.map((l) => (
        <button
          key={l.label}
          onClick={() => onChange(l.value)}
          className={cn(
            "px-2 py-1 rounded text-[10px] font-semibold border transition-colors",
            speed === l.value
              ? "bg-cyan-600 border-cyan-500 text-white"
              : "bg-slate-200 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400"
          )}
          data-testid={`mobile-speed-${l.label.toLowerCase()}`}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}

// ── Hue helpers ───────────────────────────────────────────────────────────────

function LightingTab() {
  const [bridges, setBridges] = useState<HueBridge[]>([]);
  const [selectedBridgeId, setSelectedBridgeId] = useState<number | null>(null);
  const [scenes, setScenes] = useState<HueScene[]>([]);
  const [groups, setGroups] = useState<HueGroup[]>([]);
  const [lights, setLights] = useState<HueLight[]>([]);
  const [loadingBridge, setLoadingBridge] = useState(false);
  const [activatingScene, setActivatingScene] = useState<string | null>(null);
  const [lightingTab, setLightingTab] = useState<"scenes" | "rooms" | "lights">("scenes");

  useEffect(() => {
    fetch("/api/hue/bridges")
      .then((r) => r.json())
      .then(setBridges)
      .catch(() => {});
  }, []);

  // Auto-select the only paired bridge
  useEffect(() => {
    const paired = bridges.filter((b) => b.apiKey);
    if (paired.length === 1 && !selectedBridgeId) {
      setSelectedBridgeId(paired[0].id);
    }
  }, [bridges, selectedBridgeId]);

  useEffect(() => {
    if (!selectedBridgeId) return;
    setLoadingBridge(true);
    Promise.all([
      fetch(`/api/hue/bridges/${selectedBridgeId}/scenes`).then((r) => r.json()).catch(() => []),
      fetch(`/api/hue/bridges/${selectedBridgeId}/groups`).then((r) => r.json()).catch(() => []),
      fetch(`/api/hue/bridges/${selectedBridgeId}/lights`).then((r) => r.json()).catch(() => []),
    ]).then(([s, g, l]) => {
      setScenes(s);
      setGroups(g);
      setLights(l);
      setLoadingBridge(false);
    });
  }, [selectedBridgeId]);

  const activateScene = async (sceneId: string) => {
    if (!selectedBridgeId) return;
    setActivatingScene(sceneId);
    try {
      const res = await fetch(
        `/api/hue/bridges/${selectedBridgeId}/scenes/${sceneId}/activate`,
        { method: "POST" }
      );
      if (res.ok) toast.success("Scene activated", { duration: 1500 });
      else toast.error("Failed to activate scene");
    } catch {
      toast.error("Connection error");
    } finally {
      setActivatingScene(null);
    }
  };

  const toggleGroup = async (groupId: string, on: boolean) => {
    if (!selectedBridgeId) return;
    await fetch(`/api/hue/bridges/${selectedBridgeId}/groups/${groupId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ on }),
    });
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? { ...g, state: { all_on: on, any_on: on }, action: { ...g.action, on } }
          : g
      )
    );
  };

  const setGroupBrightness = async (groupId: string, bri: number) => {
    if (!selectedBridgeId) return;
    await fetch(`/api/hue/bridges/${selectedBridgeId}/groups/${groupId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ on: true, bri }),
    });
  };

  const toggleLight = async (lightId: string, on: boolean) => {
    if (!selectedBridgeId) return;
    await fetch(`/api/hue/bridges/${selectedBridgeId}/lights/${lightId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ on }),
    });
    setLights((prev) =>
      prev.map((l) =>
        l.id === lightId ? { ...l, state: { ...l.state, on } } : l
      )
    );
  };

  if (bridges.length === 0) {
    return (
      <div className="p-6 text-center text-slate-400 dark:text-slate-600 text-sm">
        No Hue bridges configured.
        <br />
        Add bridges from the Lighting page on the desktop.
      </div>
    );
  }

  const paired = bridges.filter((b) => b.apiKey);

  return (
    <div className="p-3 space-y-3">
      {/* Bridge selector */}
      {paired.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {paired.map((b) => (
            <button
              key={b.id}
              onClick={() => setSelectedBridgeId(b.id)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                selectedBridgeId === b.id
                  ? "border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                  : "border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400"
              )}
              data-testid={`mobile-hue-bridge-${b.id}`}
            >
              {b.name}
            </button>
          ))}
        </div>
      )}

      {paired.length === 0 && (
        <p className="text-xs text-slate-400 dark:text-slate-600 text-center py-4">
          No paired bridges. Pair from the Lighting page.
        </p>
      )}

      {selectedBridgeId && (
        <>
          {/* Sub-tabs */}
          <div className="flex border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            {(["scenes", "rooms", "lights"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setLightingTab(t)}
                className={cn(
                  "flex-1 py-2 text-[10px] font-medium uppercase tracking-wider transition-colors",
                  lightingTab === t
                    ? "bg-amber-500 text-white"
                    : "text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                )}
                data-testid={`mobile-lighting-tab-${t}`}
              >
                {t}
              </button>
            ))}
          </div>

          {loadingBridge && (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            </div>
          )}

          {!loadingBridge && lightingTab === "scenes" && (
            <div className="grid grid-cols-2 gap-2">
              {scenes.length === 0 && (
                <p className="col-span-2 text-center text-xs text-slate-400 dark:text-slate-600 py-4">
                  No scenes found
                </p>
              )}
              {scenes.map((scene) => (
                <button
                  key={scene.id}
                  onClick={() => activateScene(scene.id)}
                  disabled={activatingScene === scene.id}
                  className="py-3 px-2 rounded-lg border border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 text-xs font-medium text-center active:scale-95 transition-all disabled:opacity-50"
                  data-testid={`mobile-hue-scene-${scene.id}`}
                >
                  {activatingScene === scene.id ? (
                    <Loader2 className="w-3 h-3 animate-spin mx-auto" />
                  ) : (
                    scene.name
                  )}
                </button>
              ))}
            </div>
          )}

          {!loadingBridge && lightingTab === "rooms" && (
            <div className="space-y-2">
              {groups.length === 0 && (
                <p className="text-center text-xs text-slate-400 dark:text-slate-600 py-4">
                  No rooms found
                </p>
              )}
              {groups.map((group) => (
                <div
                  key={group.id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100/50 dark:bg-slate-900/50"
                >
                  <button
                    onClick={() => toggleGroup(group.id, !group.state.any_on)}
                    className={cn(
                      "w-10 h-6 rounded-full relative transition-colors shrink-0",
                      group.state.any_on ? "bg-amber-500" : "bg-slate-300 dark:bg-slate-700"
                    )}
                    data-testid={`mobile-hue-group-toggle-${group.id}`}
                  >
                    <div
                      className={cn(
                        "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform",
                        group.state.any_on ? "translate-x-4" : "translate-x-0.5"
                      )}
                    />
                  </button>
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300 flex-1 truncate">
                    {group.name}
                  </span>
                  {group.state.any_on && (
                    <input
                      type="range"
                      min={1}
                      max={254}
                      defaultValue={group.action.bri ?? 254}
                      onMouseUp={(e) => setGroupBrightness(group.id, parseInt((e.target as HTMLInputElement).value))}
                      onTouchEnd={(e) => setGroupBrightness(group.id, parseInt((e.target as HTMLInputElement).value))}
                      className="w-20 accent-amber-500"
                      data-testid={`mobile-hue-group-bri-${group.id}`}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {!loadingBridge && lightingTab === "lights" && (
            <div className="space-y-2">
              {lights.length === 0 && (
                <p className="text-center text-xs text-slate-400 dark:text-slate-600 py-4">
                  No lights found
                </p>
              )}
              {lights.map((light) => (
                <div
                  key={light.id}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-lg border",
                    light.state.reachable
                      ? "border-slate-200 dark:border-slate-800 bg-slate-100/50 dark:bg-slate-900/50"
                      : "border-slate-100 dark:border-slate-900 opacity-50"
                  )}
                >
                  <button
                    onClick={() => toggleLight(light.id, !light.state.on)}
                    className={cn(
                      "w-10 h-6 rounded-full relative transition-colors shrink-0",
                      light.state.on ? "bg-amber-500" : "bg-slate-300 dark:bg-slate-700"
                    )}
                    data-testid={`mobile-hue-light-toggle-${light.id}`}
                  >
                    <div
                      className={cn(
                        "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform",
                        light.state.on ? "translate-x-4" : "translate-x-0.5"
                      )}
                    />
                  </button>
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300 flex-1 truncate">
                    {light.name}
                  </span>
                  {!light.state.reachable && (
                    <span className="text-[9px] text-slate-400 dark:text-slate-600">unreachable</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function MobilePage() {
  const queryClient = useQueryClient();
  const ws = useWebSocket();
  const { theme, setTheme } = useTheme();
  const { atemState, cut: atemCut, auto: atemAuto, setProgramInput: atemSetProgram, setPreviewInput: atemSetPreview } = useAtemControl();
  const [selectedCameraId, setSelectedCameraId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"control" | "scenes" | "macros" | "switcher" | "lighting">("control");
  const [ptSpeed, setPtSpeed] = useState(0.5);

  const { data: cameras = [] } = useQuery({
    queryKey: ["cameras"],
    queryFn: cameraApi.getAll,
  });

  const { data: sceneButtons = [] } = useQuery({
    queryKey: ["scene-buttons"],
    queryFn: sceneButtonApi.getAll,
  });

  const { data: presets = [] } = useQuery<Preset[]>({
    queryKey: ["presets", selectedCameraId],
    queryFn: () =>
      selectedCameraId ? cameraApi.getPresets(selectedCameraId) : Promise.resolve([]),
    enabled: !!selectedCameraId,
  });

  const { data: macros = [] } = useQuery({
    queryKey: ["macros"],
    queryFn: macroApi.getAll,
  });

  const executeMacroMutation = useMutation({
    mutationFn: macroApi.execute,
    onSuccess: (_, id) => {
      const m = macros.find((x: any) => x.id === id);
      toast.success(`${m?.name ?? "Macro"} executed`, { duration: 1500 });
    },
    onError: (_, id) => {
      const m = macros.find((x: any) => x.id === id);
      toast.error(`Failed to run ${m?.name ?? "macro"}`);
    },
  });

  // Auto-select first camera
  useEffect(() => {
    if (cameras.length > 0 && !selectedCameraId) {
      setSelectedCameraId(cameras[0].id);
    }
  }, [cameras, selectedCameraId]);

  // Handle paired Hue bridge auto-select (done inside LightingTab)

  const executeScene = async (btn: SceneButton) => {
    try {
      const res = await fetch(`/api/scene-buttons/${btn.id}/execute`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.message || `Failed to execute "${btn.name}"`);
        return;
      }
      toast.success(`${btn.name} executed`, { duration: 1500 });
    } catch (err: any) {
      toast.error(`Error: ${err.message || "Connection failed"}`);
    }
  };

  const selectedCamera = cameras.find((c: Camera) => c.id === selectedCameraId);

  const tabs = [
    { id: "control", label: "Camera" },
    { id: "scenes", label: "Scenes" },
    { id: "macros", label: "Macros" },
    { id: "switcher", label: "Switcher" },
    { id: "lighting", label: "Lighting" },
  ] as const;

  return (
    <div
      className="min-h-screen bg-background text-foreground flex flex-col"
      style={{ maxWidth: "100vw", overflow: "hidden" }}
    >
      {/* Header */}
      <header className="h-11 border-b border-slate-200 dark:border-slate-800 bg-slate-400 dark:bg-slate-950 flex items-center justify-between px-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
            </svg>
          </div>
          <div>
            <span className="font-bold text-sm leading-none">
              PTZ<span className="text-cyan-500 font-light">CMD</span>
            </span>
            <span
              className="text-[8px] font-mono text-slate-400 dark:text-slate-600 ml-1"
              data-testid="text-version-mobile"
            >
              v{APP_VERSION}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {atemState?.connected && (
            <span className="text-[9px] font-mono text-green-600 dark:text-green-500 px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-950 border border-green-300 dark:border-green-900">
              ATEM
            </span>
          )}
          {/* Theme toggle */}
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="w-7 h-7 rounded flex items-center justify-center border border-slate-300 dark:border-slate-700 bg-slate-300 dark:bg-slate-800 active:bg-slate-200 dark:active:bg-slate-700 transition-colors"
            data-testid="mobile-theme-toggle"
          >
            {theme === "dark" ? (
              <Sun className="w-3.5 h-3.5 text-amber-400" />
            ) : (
              <Moon className="w-3.5 h-3.5 text-slate-600" />
            )}
          </button>
        </div>
      </header>

      {/* Tab bar */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-400/50 dark:bg-slate-950/50 shrink-0 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex-1 py-2.5 text-[10px] font-medium uppercase tracking-wider transition-colors whitespace-nowrap px-2",
              activeTab === tab.id
                ? "text-cyan-600 dark:text-cyan-400 border-b-2 border-cyan-500 bg-slate-300/50 dark:bg-slate-900/50"
                : "text-slate-400 dark:text-slate-500"
            )}
            data-testid={`mobile-tab-${tab.id}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* ── Camera tab ── */}
        {activeTab === "control" && (
          <div className="p-3 space-y-4">
            {/* Camera selector with tally */}
            <div className="grid grid-cols-4 gap-2">
              {cameras.map((cam: Camera) => {
                const tally = cam.tallyState || "off";
                const isSelected = cam.id === selectedCameraId;
                return (
                  <button
                    key={cam.id}
                    onClick={() => setSelectedCameraId(cam.id)}
                    className={cn(
                      "py-3 px-1 rounded-lg border text-center transition-all",
                      tally === "program"
                        ? "border-red-500 bg-red-100/40 dark:bg-red-950/40 shadow-[0_0_12px_rgba(239,68,68,0.2)]"
                        : tally === "preview"
                        ? "border-green-500 bg-green-100/40 dark:bg-green-950/40 shadow-[0_0_12px_rgba(34,197,94,0.2)]"
                        : isSelected
                        ? "border-cyan-500 bg-cyan-100/30 dark:bg-cyan-950/30"
                        : "border-slate-300 dark:border-slate-800 bg-slate-300/50 dark:bg-slate-900/50"
                    )}
                    data-testid={`mobile-camera-${cam.id}`}
                  >
                    <div className="flex items-center justify-center gap-1 mb-1">
                      {tally === "program" && (
                        <span className="text-[8px] font-bold px-1 rounded bg-red-600 text-white">PGM</span>
                      )}
                      {tally === "preview" && (
                        <span className="text-[8px] font-bold px-1 rounded bg-green-600 text-white">PVW</span>
                      )}
                    </div>
                    <div
                      className={cn(
                        "text-xs font-bold truncate",
                        isSelected ? "text-cyan-600 dark:text-cyan-300" : "text-slate-700 dark:text-slate-300"
                      )}
                    >
                      {cam.name}
                    </div>
                    <div className="flex items-center justify-center gap-1 mt-1">
                      <div
                        className={cn(
                          "w-1.5 h-1.5 rounded-full",
                          cam.status === "online" ? "bg-green-500" : "bg-red-300 dark:bg-red-900"
                        )}
                      />
                      <span className="text-[9px] text-slate-400 dark:text-slate-600">{cam.status}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {selectedCameraId && (
              <>
                {/* Speed + joystick + lens controls */}
                <div className="flex flex-col items-center gap-3">
                  <SpeedToggle speed={ptSpeed} onChange={setPtSpeed} />
                  <div className="flex items-center gap-6">
                    <MobileJoystick cameraId={selectedCameraId} ws={ws} speed={ptSpeed} />
                    <LensControls cameraId={selectedCameraId} ws={ws} />
                  </div>
                </div>

                {/* Presets */}
                <div>
                  <h3 className="text-[10px] font-mono text-slate-400 dark:text-slate-600 uppercase tracking-widest mb-2">
                    Presets — {selectedCamera?.name}
                  </h3>
                  <div className="grid grid-cols-4 gap-2">
                    {Array.from({ length: 16 }, (_, i) => {
                      const preset = presets.find((p) => p.presetNumber === i);
                      return (
                        <button
                          key={i}
                          onClick={() => ws.recallPreset(selectedCameraId!, i)}
                          className={cn(
                            "py-3 rounded-lg border text-center transition-all active:scale-95",
                            preset
                              ? "border-cyan-300 dark:border-cyan-800 bg-cyan-100/30 dark:bg-cyan-950/30 text-cyan-700 dark:text-cyan-300"
                              : "border-slate-300 dark:border-slate-800 bg-slate-300/50 dark:bg-slate-900/50 text-slate-400 dark:text-slate-600"
                          )}
                          data-testid={`mobile-preset-${i}`}
                        >
                          <div className="text-xs font-bold">{i + 1}</div>
                          {preset?.name && (
                            <div className="text-[9px] text-slate-400 dark:text-slate-500 truncate px-1 mt-0.5">
                              {preset.name}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Scenes tab ── */}
        {activeTab === "scenes" && (
          <div className="p-3 space-y-3">
            <h3 className="text-[10px] font-mono text-slate-400 dark:text-slate-600 uppercase tracking-widest">
              Scene Buttons
            </h3>
            {sceneButtons.length === 0 ? (
              <div className="text-center py-12 text-slate-400 dark:text-slate-600 text-sm">
                No scene buttons configured
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {(sceneButtons as SceneButton[])
                  .sort((a, b) => a.buttonNumber - b.buttonNumber)
                  .map((btn) => (
                    <button
                      key={btn.id}
                      onClick={() => executeScene(btn)}
                      className="py-4 px-3 rounded-lg border border-slate-300 dark:border-slate-700 text-center transition-all active:scale-95"
                      style={{
                        borderColor: btn.color,
                        backgroundColor: `${btn.color}15`,
                      }}
                      data-testid={`mobile-scene-${btn.id}`}
                    >
                      <div className="font-bold text-sm" style={{ color: btn.color }}>
                        {btn.name}
                      </div>
                      <div className="text-[9px] text-slate-400 dark:text-slate-500 mt-1">
                        {[
                          btn.atemInputId && `ATEM ${btn.atemInputId}`,
                          btn.cameraId && `CAM ${btn.cameraId}`,
                          btn.presetNumber !== null &&
                            btn.presetNumber !== undefined &&
                            `P${btn.presetNumber + 1}`,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "No actions"}
                      </div>
                    </button>
                  ))}
              </div>
            )}
          </div>
        )}

        {/* ── Macros tab ── */}
        {activeTab === "macros" && (
          <div className="p-3 space-y-3">
            <h3 className="text-[10px] font-mono text-slate-400 dark:text-slate-600 uppercase tracking-widest">
              Macros
            </h3>
            {macros.length === 0 ? (
              <div className="text-center py-12 text-slate-400 dark:text-slate-600 text-sm">
                No macros configured
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                {(macros as any[]).map((macro) => {
                  const isRunning =
                    executeMacroMutation.isPending &&
                    executeMacroMutation.variables === macro.id;
                  const steps = (() => {
                    try {
                      return JSON.parse(macro.steps || "[]");
                    } catch {
                      return [];
                    }
                  })();
                  return (
                    <div
                      key={macro.id}
                      className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100/50 dark:bg-slate-900/50"
                      data-testid={`mobile-macro-${macro.id}`}
                    >
                      <div
                        className="w-2.5 h-8 rounded-full shrink-0"
                        style={{ backgroundColor: macro.color || "#06b6d4" }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm text-slate-800 dark:text-slate-200 truncate">
                          {macro.name}
                        </div>
                        {macro.description && (
                          <div className="text-[10px] text-slate-400 dark:text-slate-600 truncate">
                            {macro.description}
                          </div>
                        )}
                        <div className="text-[9px] text-slate-400 dark:text-slate-600 mt-0.5">
                          {steps.length} step{steps.length !== 1 ? "s" : ""}
                        </div>
                      </div>
                      <button
                        onClick={() => executeMacroMutation.mutate(macro.id)}
                        disabled={isRunning}
                        className={cn(
                          "w-10 h-10 rounded-lg border flex items-center justify-center transition-all active:scale-95",
                          isRunning
                            ? "border-cyan-300 dark:border-cyan-800 bg-cyan-50 dark:bg-cyan-950/30"
                            : "border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 active:bg-cyan-700 active:border-cyan-600 active:text-white"
                        )}
                        data-testid={`mobile-macro-run-${macro.id}`}
                      >
                        {isRunning ? (
                          <Loader2 className="w-4 h-4 animate-spin text-cyan-500" />
                        ) : (
                          <Play className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Switcher tab ── */}
        {activeTab === "switcher" && (
          <div className="p-3 space-y-4">
            {!atemState?.connected ? (
              <div className="text-center py-12 text-slate-400 dark:text-slate-600 text-sm">
                ATEM not connected
              </div>
            ) : (
              <>
                <div className="flex gap-3">
                  <button
                    onClick={atemCut}
                    className="flex-1 py-4 rounded-lg bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-bold text-lg active:bg-red-700 active:text-white transition-colors"
                    data-testid="mobile-atem-cut"
                  >
                    CUT
                  </button>
                  <button
                    onClick={atemAuto}
                    className="flex-1 py-4 rounded-lg bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-bold text-lg active:bg-amber-700 active:text-white transition-colors"
                    data-testid="mobile-atem-auto"
                  >
                    AUTO
                  </button>
                </div>

                <div>
                  <h3 className="text-[10px] font-mono text-red-400 uppercase tracking-widest mb-2">
                    Program
                  </h3>
                  <div className="grid grid-cols-4 gap-2">
                    {atemState.inputs.map((input) => (
                      <button
                        key={input.inputId}
                        onClick={() => atemSetProgram(input.inputId)}
                        className={cn(
                          "py-3 rounded-lg border text-center font-bold text-sm transition-all active:scale-95",
                          atemState.programInput === input.inputId
                            ? "border-red-500 bg-red-600 text-white shadow-[0_0_15px_rgba(239,68,68,0.3)]"
                            : "border-slate-300 dark:border-slate-700 bg-slate-300 dark:bg-slate-900 text-slate-500 dark:text-slate-400"
                        )}
                        data-testid={`mobile-pgm-${input.inputId}`}
                      >
                        {input.shortName}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-[10px] font-mono text-green-400 uppercase tracking-widest mb-2">
                    Preview
                  </h3>
                  <div className="grid grid-cols-4 gap-2">
                    {atemState.inputs.map((input) => (
                      <button
                        key={input.inputId}
                        onClick={() => atemSetPreview(input.inputId)}
                        className={cn(
                          "py-3 rounded-lg border text-center font-bold text-sm transition-all active:scale-95",
                          atemState.previewInput === input.inputId
                            ? "border-green-500 bg-green-600 text-white shadow-[0_0_15px_rgba(34,197,94,0.3)]"
                            : "border-slate-300 dark:border-slate-700 bg-slate-300 dark:bg-slate-900 text-slate-500 dark:text-slate-400"
                        )}
                        data-testid={`mobile-pvw-${input.inputId}`}
                      >
                        {input.shortName}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Lighting tab ── */}
        {activeTab === "lighting" && <LightingTab />}
      </div>
    </div>
  );
}
