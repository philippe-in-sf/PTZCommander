import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cameraApi, sceneButtonApi } from "@/lib/api";
import { useWebSocket } from "@/lib/websocket";
import { APP_VERSION } from "@shared/version";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Camera, Preset, SceneButton } from "@shared/schema";

interface AtemState {
  connected: boolean;
  programInput: number;
  previewInput: number;
  inputs: { inputId: number; shortName: string; longName: string }[];
}

function MobileJoystick({ cameraId, ws }: { cameraId: number; ws: ReturnType<typeof useWebSocket> }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const animRef = useRef<number | null>(null);

  const maxRadius = 60;

  const handleMove = useCallback((clientX: number, clientY: number) => {
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

    const pan = dx / maxRadius;
    const tilt = -dy / maxRadius;
    ws.panTilt(cameraId, pan, tilt, 0.5);
  }, [cameraId, ws]);

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
        className="relative w-36 h-36 rounded-full bg-slate-900 border-2 border-slate-700 touch-none"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={handleEnd}
        onTouchCancel={handleEnd}
        data-testid="mobile-joystick"
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-px h-full bg-slate-800" />
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-px w-full bg-slate-800" />
        </div>
        <div
          className={cn(
            "absolute w-14 h-14 rounded-full transition-colors",
            active ? "bg-cyan-500/80 shadow-[0_0_20px_rgba(6,182,212,0.5)]" : "bg-slate-700"
          )}
          style={{
            left: `calc(50% + ${pos.x}px - 28px)`,
            top: `calc(50% + ${pos.y}px - 28px)`,
            transition: active ? "none" : "all 0.2s ease-out",
          }}
        />
      </div>
      <span className="text-[10px] font-mono text-slate-600 uppercase">Pan / Tilt</span>
    </div>
  );
}

function ZoomControl({ cameraId, ws }: { cameraId: number; ws: ReturnType<typeof useWebSocket> }) {
  const sendZoom = (direction: number) => {
    ws.zoom(cameraId, direction, 0.4);
  };
  const stopZoom = () => {
    ws.zoom(cameraId, 0, 0);
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        className="w-14 h-10 rounded-t-lg bg-slate-800 border border-slate-700 text-white font-bold text-lg active:bg-cyan-700 touch-none select-none"
        onTouchStart={() => sendZoom(1)}
        onTouchEnd={stopZoom}
        onTouchCancel={stopZoom}
        data-testid="mobile-zoom-in"
      >
        T
      </button>
      <span className="text-[9px] font-mono text-slate-600">ZOOM</span>
      <button
        className="w-14 h-10 rounded-b-lg bg-slate-800 border border-slate-700 text-white font-bold text-lg active:bg-cyan-700 touch-none select-none"
        onTouchStart={() => sendZoom(-1)}
        onTouchEnd={stopZoom}
        onTouchCancel={stopZoom}
        data-testid="mobile-zoom-out"
      >
        W
      </button>
    </div>
  );
}

export default function MobilePage() {
  const queryClient = useQueryClient();
  const ws = useWebSocket();
  const [selectedCameraId, setSelectedCameraId] = useState<number | null>(null);
  const [atemState, setAtemState] = useState<AtemState | null>(null);
  const [activeTab, setActiveTab] = useState<"control" | "scenes" | "switcher">("control");

  const { data: cameras = [] } = useQuery({
    queryKey: ["cameras"],
    queryFn: cameraApi.getAll,
    refetchInterval: 3000,
  });

  const { data: sceneButtons = [] } = useQuery({
    queryKey: ["scene-buttons"],
    queryFn: sceneButtonApi.getAll,
  });

  const { data: presets = [] } = useQuery({
    queryKey: ["presets", selectedCameraId],
    queryFn: () => selectedCameraId ? cameraApi.getPresets(selectedCameraId) : Promise.resolve([]),
    enabled: !!selectedCameraId,
  });

  useEffect(() => {
    if (cameras.length > 0 && !selectedCameraId) {
      setSelectedCameraId(cameras[0].id);
    }
  }, [cameras, selectedCameraId]);

  useEffect(() => {
    const handler = (msg: any) => {
      if (msg.type === "atem_state") {
        setAtemState(msg);
      }
    };
    ws.addMessageHandler(handler);
    return () => ws.removeMessageHandler(handler);
  }, [ws]);

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

  const atemCut = () => ws.send({ type: "atem_cut" });
  const atemAuto = () => ws.send({ type: "atem_auto" });
  const atemSetProgram = (id: number) => ws.send({ type: "atem_program", inputId: id });
  const atemSetPreview = (id: number) => ws.send({ type: "atem_preview", inputId: id });

  const selectedCamera = cameras.find(c => c.id === selectedCameraId);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col" style={{ maxWidth: "100vw", overflow: "hidden" }}>
      <header className="h-11 border-b border-slate-800 bg-slate-950 flex items-center justify-between px-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>
          </div>
          <div>
            <span className="font-bold text-sm leading-none">PTZ<span className="text-cyan-500 font-light">CMD</span></span>
            <span className="text-[8px] font-mono text-slate-600 ml-1" data-testid="text-version-mobile">v{APP_VERSION}</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {atemState?.connected && (
            <span className="text-[9px] font-mono text-green-500 px-1.5 py-0.5 rounded bg-green-950 border border-green-900">ATEM</span>
          )}
        </div>
      </header>

      <div className="flex border-b border-slate-800 bg-slate-950/50 shrink-0">
        {(["control", "scenes", "switcher"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "flex-1 py-2.5 text-xs font-medium uppercase tracking-wider transition-colors",
              activeTab === tab ? "text-cyan-400 border-b-2 border-cyan-500 bg-slate-900/50" : "text-slate-500"
            )}
            data-testid={`mobile-tab-${tab}`}
          >
            {tab === "control" ? "Camera" : tab === "scenes" ? "Scenes" : "Switcher"}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === "control" && (
          <div className="p-3 space-y-4">
            <div className="grid grid-cols-4 gap-2">
              {cameras.map(cam => {
                const tally = cam.tallyState || "off";
                const isSelected = cam.id === selectedCameraId;
                return (
                  <button
                    key={cam.id}
                    onClick={() => setSelectedCameraId(cam.id)}
                    className={cn(
                      "py-3 px-1 rounded-lg border text-center transition-all",
                      tally === "program"
                        ? "border-red-500 bg-red-950/40 shadow-[0_0_12px_rgba(239,68,68,0.2)]"
                        : tally === "preview"
                        ? "border-green-500 bg-green-950/40 shadow-[0_0_12px_rgba(34,197,94,0.2)]"
                        : isSelected
                        ? "border-cyan-500 bg-cyan-950/30"
                        : "border-slate-800 bg-slate-900/50"
                    )}
                    data-testid={`mobile-camera-${cam.id}`}
                  >
                    <div className="flex items-center justify-center gap-1 mb-1">
                      {tally === "program" && <span className="text-[8px] font-bold px-1 rounded bg-red-600 text-white">PGM</span>}
                      {tally === "preview" && <span className="text-[8px] font-bold px-1 rounded bg-green-600 text-white">PVW</span>}
                    </div>
                    <div className={cn(
                      "text-xs font-bold truncate",
                      isSelected ? "text-cyan-300" : "text-slate-300"
                    )}>
                      {cam.name}
                    </div>
                    <div className="flex items-center justify-center gap-1 mt-1">
                      <div className={cn(
                        "w-1.5 h-1.5 rounded-full",
                        cam.status === "online" ? "bg-green-500" : "bg-red-900"
                      )} />
                      <span className="text-[9px] text-slate-600">{cam.status}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {selectedCameraId && (
              <>
                <div className="flex items-center justify-center gap-6">
                  <MobileJoystick cameraId={selectedCameraId} ws={ws} />
                  <ZoomControl cameraId={selectedCameraId} ws={ws} />
                </div>

                <div>
                  <h3 className="text-[10px] font-mono text-slate-600 uppercase tracking-widest mb-2">Presets — {selectedCamera?.name}</h3>
                  <div className="grid grid-cols-4 gap-2">
                    {Array.from({ length: 16 }, (_, i) => {
                      const preset = presets.find(p => p.presetNumber === i);
                      return (
                        <button
                          key={i}
                          onClick={() => ws.recallPreset(selectedCameraId!, i)}
                          className={cn(
                            "py-3 rounded-lg border text-center transition-all active:scale-95",
                            preset
                              ? "border-cyan-800 bg-cyan-950/30 text-cyan-300"
                              : "border-slate-800 bg-slate-900/50 text-slate-600"
                          )}
                          data-testid={`mobile-preset-${i}`}
                        >
                          <div className="text-xs font-bold">{i + 1}</div>
                          {preset?.name && <div className="text-[9px] text-slate-500 truncate px-1 mt-0.5">{preset.name}</div>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === "scenes" && (
          <div className="p-3 space-y-3">
            <h3 className="text-[10px] font-mono text-slate-600 uppercase tracking-widest">Scene Buttons</h3>
            {sceneButtons.length === 0 ? (
              <div className="text-center py-12 text-slate-600 text-sm">No scene buttons configured</div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {sceneButtons
                  .sort((a, b) => a.buttonNumber - b.buttonNumber)
                  .map(btn => (
                    <button
                      key={btn.id}
                      onClick={() => executeScene(btn)}
                      className="py-4 px-3 rounded-lg border border-slate-700 text-center transition-all active:scale-95"
                      style={{
                        borderColor: btn.color,
                        backgroundColor: `${btn.color}15`,
                      }}
                      data-testid={`mobile-scene-${btn.id}`}
                    >
                      <div className="font-bold text-sm" style={{ color: btn.color }}>{btn.name}</div>
                      <div className="text-[9px] text-slate-500 mt-1">
                        {[
                          btn.atemInputId && `ATEM ${btn.atemInputId}`,
                          btn.cameraId && `CAM ${btn.cameraId}`,
                          btn.presetNumber !== null && btn.presetNumber !== undefined && `P${btn.presetNumber + 1}`,
                        ].filter(Boolean).join(" · ") || "No actions"}
                      </div>
                    </button>
                  ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "switcher" && (
          <div className="p-3 space-y-4">
            {!atemState?.connected ? (
              <div className="text-center py-12 text-slate-600 text-sm">ATEM not connected</div>
            ) : (
              <>
                <div className="flex gap-3">
                  <button
                    onClick={atemCut}
                    className="flex-1 py-4 rounded-lg bg-slate-800 border border-slate-700 text-white font-bold text-lg active:bg-red-700 transition-colors"
                    data-testid="mobile-atem-cut"
                  >
                    CUT
                  </button>
                  <button
                    onClick={atemAuto}
                    className="flex-1 py-4 rounded-lg bg-slate-800 border border-slate-700 text-white font-bold text-lg active:bg-amber-700 transition-colors"
                    data-testid="mobile-atem-auto"
                  >
                    AUTO
                  </button>
                </div>

                <div>
                  <h3 className="text-[10px] font-mono text-red-400 uppercase tracking-widest mb-2">Program</h3>
                  <div className="grid grid-cols-4 gap-2">
                    {atemState.inputs.map(input => (
                      <button
                        key={input.inputId}
                        onClick={() => atemSetProgram(input.inputId)}
                        className={cn(
                          "py-3 rounded-lg border text-center font-bold text-sm transition-all active:scale-95",
                          atemState.programInput === input.inputId
                            ? "border-red-500 bg-red-600 text-white shadow-[0_0_15px_rgba(239,68,68,0.3)]"
                            : "border-slate-700 bg-slate-900 text-slate-400"
                        )}
                        data-testid={`mobile-pgm-${input.inputId}`}
                      >
                        {input.shortName}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-[10px] font-mono text-green-400 uppercase tracking-widest mb-2">Preview</h3>
                  <div className="grid grid-cols-4 gap-2">
                    {atemState.inputs.map(input => (
                      <button
                        key={input.inputId}
                        onClick={() => atemSetPreview(input.inputId)}
                        className={cn(
                          "py-3 rounded-lg border text-center font-bold text-sm transition-all active:scale-95",
                          atemState.previewInput === input.inputId
                            ? "border-green-500 bg-green-600 text-white shadow-[0_0_15px_rgba(34,197,94,0.3)]"
                            : "border-slate-700 bg-slate-900 text-slate-400"
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
      </div>
    </div>
  );
}
