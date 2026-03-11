import { useState } from "react";
import { cn } from "@/lib/utils";
import { Save, Play } from "lucide-react";
import type { Preset } from "@shared/schema";

interface PresetGridProps {
  presets: Preset[];
  onRecall: (index: number) => void;
  onStore: (index: number) => void;
}

export function PresetGrid({ presets, onRecall, onStore }: PresetGridProps) {
  const [mode, setMode] = useState<'recall' | 'store'>('recall');

  const handlePress = (index: number) => {
    if (mode === 'store') {
      onStore(index);
      setMode('recall');
    } else {
      onRecall(index);
    }
  };

  const hasPreset = (index: number) => {
    return presets.some(p => p.presetNumber === index);
  };

  return (
    <div className="bg-slate-200/50 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-800 rounded-xl p-4 flex flex-col gap-4 h-full">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-mono text-slate-500 dark:text-slate-400 uppercase tracking-widest">Presets</h3>
        <div className="flex bg-slate-100 dark:bg-slate-950 rounded-lg p-1 border border-slate-300 dark:border-slate-800">
          <button
            onClick={() => setMode('recall')}
            className={cn(
              "px-3 py-1 text-xs font-bold rounded-md flex items-center gap-1.5 transition-colors",
              mode === 'recall' 
                ? "bg-slate-200 dark:bg-slate-800 text-cyan-500 dark:text-cyan-400 shadow-sm" 
                : "text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            )}
            data-testid="button-preset-recall"
          >
            <Play className="w-3 h-3" /> RECALL
          </button>
          <button
            onClick={() => setMode('store')}
            className={cn(
              "px-3 py-1 text-xs font-bold rounded-md flex items-center gap-1.5 transition-colors",
              mode === 'store' 
                ? "bg-red-100 dark:bg-red-900/30 text-red-500 dark:text-red-400 border border-red-300 dark:border-red-900/50" 
                : "text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            )}
            data-testid="button-preset-store"
          >
            <Save className="w-3 h-3" /> STORE
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 flex-1">
        {Array.from({ length: 16 }, (_, i) => {
          const hasData = hasPreset(i);
          const preset = presets.find(p => p.presetNumber === i);
          
          return (
            <button
              key={i}
              onClick={() => handlePress(i)}
              className={cn(
                "relative group rounded-md border text-sm font-mono font-bold transition-all duration-100 flex flex-col items-center justify-center",
                mode === 'store'
                  ? "border-red-300 dark:border-red-900/30 bg-red-50/50 dark:bg-red-950/10 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/20 hover:border-red-400 dark:hover:border-red-500/50"
                  : hasData
                    ? "border-cyan-300 dark:border-cyan-900/30 bg-cyan-50/50 dark:bg-cyan-950/20 text-cyan-500 dark:text-cyan-400 hover:bg-cyan-100 dark:hover:bg-cyan-900/30 hover:border-cyan-400 dark:hover:border-cyan-500/50 shadow-[0_0_10px_rgba(6,182,212,0.05)]"
                    : "border-slate-300 dark:border-slate-800 bg-slate-200/30 dark:bg-slate-900/30 text-slate-400 dark:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-400"
              )}
              data-testid={`button-preset-${i}`}
            >
              <span className="text-lg">{i + 1}</span>
              {preset?.name && (
                <span className="text-[8px] text-slate-400 dark:text-slate-500 mt-0.5 truncate max-w-full px-1">
                  {preset.name}
                </span>
              )}
              {hasData && (
                <div className="absolute bottom-1 w-1 h-1 rounded-full bg-cyan-500" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
