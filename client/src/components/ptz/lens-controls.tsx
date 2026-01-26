import { Slider } from "@/components/ui/slider";
import { Focus, ZoomIn, Gauge } from "lucide-react";

interface LensControlsProps {
  onZoomChange: (val: number) => void;
  onFocusChange: (val: number) => void;
  onSpeedChange: (val: number) => void;
}

export function LensControls({ onZoomChange, onFocusChange, onSpeedChange }: LensControlsProps) {
  return (
    <div className="grid grid-cols-1 gap-6 p-4 bg-slate-900/50 border border-slate-800 rounded-xl">
      <div className="space-y-3">
        <div className="flex items-center justify-between text-slate-400">
          <label className="text-xs font-mono uppercase flex items-center gap-2">
            <ZoomIn className="w-3.5 h-3.5" /> Zoom Speed
          </label>
          <span className="text-xs font-mono text-cyan-500">100%</span>
        </div>
        <Slider 
          defaultValue={[50]} 
          max={100} 
          step={1} 
          onValueChange={(v) => onZoomChange(v[0])}
          className="[&>.absolute]:bg-cyan-500"
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between text-slate-400">
          <label className="text-xs font-mono uppercase flex items-center gap-2">
            <Focus className="w-3.5 h-3.5" /> Focus
          </label>
          <span className="text-xs font-mono text-cyan-500">AUTO</span>
        </div>
        <Slider 
          defaultValue={[50]} 
          max={100} 
          step={1} 
          onValueChange={(v) => onFocusChange(v[0])}
        />
        <div className="flex justify-between gap-2 mt-1">
          <button className="flex-1 py-1 text-[10px] font-bold bg-cyan-950/30 text-cyan-400 border border-cyan-900/50 rounded hover:bg-cyan-900/50 uppercase tracking-wider">
            Auto Focus
          </button>
          <button className="flex-1 py-1 text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700 rounded hover:bg-slate-700 uppercase tracking-wider">
            One Push
          </button>
        </div>
      </div>

      <div className="space-y-3 pt-2 border-t border-slate-800/50">
        <div className="flex items-center justify-between text-slate-400">
          <label className="text-xs font-mono uppercase flex items-center gap-2">
            <Gauge className="w-3.5 h-3.5" /> Pan/Tilt Speed
          </label>
          <span className="text-xs font-mono text-amber-500">FAST</span>
        </div>
        <Slider 
          defaultValue={[80]} 
          max={100} 
          step={1} 
          onValueChange={(v) => onSpeedChange(v[0])}
        />
      </div>
    </div>
  );
}
