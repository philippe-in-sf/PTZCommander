import { useState } from "react";
import { cn } from "@/lib/utils";
import { Save, Play } from "lucide-react";

interface PresetGridProps {
  onRecall: (index: number) => void;
  onStore: (index: number) => void;
}

export function PresetGrid({ onRecall, onStore }: PresetGridProps) {
  const [mode, setMode] = useState<'recall' | 'store'>('recall');
  // Mock preset state (just boolean for "has preset")
  const [presets, setPresets] = useState<boolean[]>(Array(16).fill(false));

  const handlePress = (index: number) => {
    if (mode === 'store') {
      const newPresets = [...presets];
      newPresets[index] = true;
      setPresets(newPresets);
      onStore(index);
      setMode('recall'); // Switch back to recall after storing usually
    } else {
      onRecall(index);
    }
  };

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 flex flex-col gap-4 h-full">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-mono text-slate-400 uppercase tracking-widest">Presets</h3>
        <div className="flex bg-slate-950 rounded-lg p-1 border border-slate-800">
          <button
            onClick={() => setMode('recall')}
            className={cn(
              "px-3 py-1 text-xs font-bold rounded-md flex items-center gap-1.5 transition-colors",
              mode === 'recall' 
                ? "bg-slate-800 text-cyan-400 shadow-sm" 
                : "text-slate-500 hover:text-slate-300"
            )}
          >
            <Play className="w-3 h-3" /> RECALL
          </button>
          <button
            onClick={() => setMode('store')}
            className={cn(
              "px-3 py-1 text-xs font-bold rounded-md flex items-center gap-1.5 transition-colors",
              mode === 'store' 
                ? "bg-red-900/30 text-red-400 border border-red-900/50" 
                : "text-slate-500 hover:text-slate-300"
            )}
          >
            <Save className="w-3 h-3" /> STORE
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 flex-1">
        {presets.map((hasPreset, i) => (
          <button
            key={i}
            onClick={() => handlePress(i)}
            className={cn(
              "relative group rounded-md border text-sm font-mono font-bold transition-all duration-100 flex flex-col items-center justify-center",
              mode === 'store'
                ? "border-red-900/30 bg-red-950/10 text-red-500 hover:bg-red-900/20 hover:border-red-500/50"
                : hasPreset
                  ? "border-cyan-900/30 bg-cyan-950/20 text-cyan-400 hover:bg-cyan-900/30 hover:border-cyan-500/50 shadow-[0_0_10px_rgba(6,182,212,0.05)]"
                  : "border-slate-800 bg-slate-900/30 text-slate-600 hover:bg-slate-800 hover:text-slate-400"
            )}
          >
            <span className="text-lg">{i + 1}</span>
            {hasPreset && (
              <div className="absolute bottom-1 w-1 h-1 rounded-full bg-cyan-500" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
