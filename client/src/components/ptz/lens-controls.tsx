import { useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Focus, ZoomIn, Gauge } from "lucide-react";
import { cn } from "@/lib/utils";

interface LensControlsProps {
  panTiltSpeed: number;
  onZoomStart: (direction: 1 | -1, speed: number) => void;
  onZoomStop: () => void;
  onFocusFarStart: (speed: number) => void;
  onFocusNearStart: (speed: number) => void;
  onFocusStop: () => void;
  onFocusAuto: () => void;
  onPanTiltSpeedChange: (speed: number) => void;
}

function sliderValueToSpeed(value: number) {
  return Math.max(0.1, value / 100);
}

function speedLabel(speed: number) {
  if (speed < 0.35) return "SLOW";
  if (speed < 0.75) return "MED";
  return "FAST";
}

const transportButtonClass =
  "h-10 rounded border text-xs font-bold uppercase transition-colors select-none touch-none " +
  "bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 " +
  "hover:bg-cyan-100 dark:hover:bg-cyan-950 hover:text-cyan-700 dark:hover:text-cyan-300 active:bg-cyan-600 active:text-white";

export function LensControls({
  panTiltSpeed,
  onZoomStart,
  onZoomStop,
  onFocusFarStart,
  onFocusNearStart,
  onFocusStop,
  onFocusAuto,
  onPanTiltSpeedChange,
}: LensControlsProps) {
  const [zoomSpeed, setZoomSpeed] = useState(0.5);
  const [focusSpeed, setFocusSpeed] = useState(0.5);

  const updateZoomSpeed = (value: number) => setZoomSpeed(sliderValueToSpeed(value));
  const updateFocusSpeed = (value: number) => setFocusSpeed(sliderValueToSpeed(value));
  const updatePanTiltSpeed = (value: number) => {
    const nextSpeed = sliderValueToSpeed(value);
    onPanTiltSpeedChange(nextSpeed);
  };

  return (
    <div className="grid grid-cols-1 gap-6 p-4 bg-slate-300/50 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-800 rounded-lg">
      <div className="space-y-3">
        <div className="flex items-center justify-between text-slate-700 dark:text-slate-400">
          <label className="text-xs font-mono uppercase flex items-center gap-2">
            <ZoomIn className="w-3.5 h-3.5" /> Zoom Speed
          </label>
          <span className="text-xs font-mono text-cyan-600 dark:text-cyan-500">{Math.round(zoomSpeed * 100)}%</span>
        </div>
        <Slider 
          defaultValue={[50]} 
          max={100} 
          min={10}
          step={1} 
          onValueChange={(v) => updateZoomSpeed(v[0])}
          className="[&>.absolute]:bg-cyan-500"
        />
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className={transportButtonClass}
            onPointerDown={() => onZoomStart(-1, zoomSpeed)}
            onPointerUp={onZoomStop}
            onPointerCancel={onZoomStop}
            onPointerLeave={onZoomStop}
            onBlur={onZoomStop}
            data-testid="button-zoom-wide"
          >
            Wide
          </button>
          <button
            type="button"
            className={transportButtonClass}
            onPointerDown={() => onZoomStart(1, zoomSpeed)}
            onPointerUp={onZoomStop}
            onPointerCancel={onZoomStop}
            onPointerLeave={onZoomStop}
            onBlur={onZoomStop}
            data-testid="button-zoom-tele"
          >
            Tele
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between text-slate-700 dark:text-slate-400">
          <label className="text-xs font-mono uppercase flex items-center gap-2">
            <Focus className="w-3.5 h-3.5" /> Focus Speed
          </label>
          <span className="text-xs font-mono text-cyan-600 dark:text-cyan-500">{Math.round(focusSpeed * 100)}%</span>
        </div>
        <Slider 
          defaultValue={[50]} 
          max={100} 
          min={10}
          step={1} 
          onValueChange={(v) => updateFocusSpeed(v[0])}
        />
        <div className="grid grid-cols-3 gap-2 mt-1">
          <button
            type="button"
            className={cn(transportButtonClass, "text-[10px]")}
            onPointerDown={() => onFocusNearStart(focusSpeed)}
            onPointerUp={onFocusStop}
            onPointerCancel={onFocusStop}
            onPointerLeave={onFocusStop}
            onBlur={onFocusStop}
            data-testid="button-focus-near"
          >
            Near
          </button>
          <button
            type="button"
            className="h-10 rounded border text-[10px] font-bold bg-cyan-100/30 dark:bg-cyan-950/30 text-cyan-700 dark:text-cyan-300 border-cyan-300/50 dark:border-cyan-900/50 hover:bg-cyan-200/50 dark:hover:bg-cyan-900/50 uppercase transition-colors"
            onClick={onFocusAuto}
            data-testid="button-panel-auto-focus"
          >
            Auto
          </button>
          <button
            type="button"
            className={cn(transportButtonClass, "text-[10px]")}
            onPointerDown={() => onFocusFarStart(focusSpeed)}
            onPointerUp={onFocusStop}
            onPointerCancel={onFocusStop}
            onPointerLeave={onFocusStop}
            onBlur={onFocusStop}
            data-testid="button-focus-far"
          >
            Far
          </button>
        </div>
      </div>

      <div className="space-y-3 pt-2 border-t border-slate-300/50 dark:border-slate-800/50">
        <div className="flex items-center justify-between text-slate-700 dark:text-slate-400">
          <label className="text-xs font-mono uppercase flex items-center gap-2">
            <Gauge className="w-3.5 h-3.5" /> Pan/Tilt Speed
          </label>
          <span className="text-xs font-mono text-amber-500">{speedLabel(panTiltSpeed)}</span>
        </div>
        <Slider 
          value={[Math.round(panTiltSpeed * 100)]}
          max={100} 
          min={10}
          step={1} 
          onValueChange={(v) => updatePanTiltSpeed(v[0])}
        />
      </div>
    </div>
  );
}
