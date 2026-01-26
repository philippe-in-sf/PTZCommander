import { cn } from "@/lib/utils";
import { Camera, Wifi, WifiOff, Activity } from "lucide-react";

export interface CameraData {
  id: number;
  name: string;
  ip: string;
  status: 'online' | 'offline' | 'tally';
}

interface CameraSelectorProps {
  cameras: CameraData[];
  selectedId: number;
  onSelect: (id: number) => void;
}

export function CameraSelector({ cameras, selectedId, onSelect }: CameraSelectorProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full">
      {cameras.map((cam) => {
        const isSelected = selectedId === cam.id;
        const isOnline = cam.status !== 'offline';
        const isTally = cam.status === 'tally';

        return (
          <button
            key={cam.id}
            onClick={() => onSelect(cam.id)}
            className={cn(
              "relative flex flex-col items-start p-4 h-32 rounded-lg border transition-all duration-200 group overflow-hidden",
              isSelected 
                ? "bg-slate-800 border-cyan-500 shadow-[0_0_20px_rgba(6,182,212,0.15)]" 
                : "bg-slate-900/50 border-slate-800 hover:border-slate-700 hover:bg-slate-800/50"
            )}
          >
            {/* Status Indicator */}
            <div className="absolute top-3 right-3 flex items-center gap-2">
              <span className={cn(
                "text-[10px] font-mono uppercase tracking-wider",
                isTally ? "text-red-500 font-bold" : "text-slate-500"
              )}>
                {isTally ? "LIVE" : cam.status}
              </span>
              <div className={cn(
                "w-2 h-2 rounded-full",
                isTally ? "bg-red-500 animate-pulse shadow-[0_0_8px_red]" : 
                isOnline ? "bg-emerald-500" : "bg-red-900"
              )} />
            </div>

            {/* Icon */}
            <div className={cn(
              "mb-auto p-2 rounded-md transition-colors",
              isSelected ? "bg-cyan-500/10 text-cyan-400" : "bg-slate-800 text-slate-500"
            )}>
              {isOnline ? <Camera className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
            </div>

            {/* Info */}
            <div className="text-left z-10">
              <div className="font-mono text-xs text-slate-500 mb-0.5">{cam.ip}</div>
              <div className={cn(
                "font-bold text-lg leading-none tracking-tight",
                isSelected ? "text-white" : "text-slate-300"
              )}>
                {cam.name}
              </div>
            </div>

            {/* Selection Corner */}
            {isSelected && (
              <div className="absolute bottom-0 right-0 w-4 h-4 bg-cyan-500 [clip-path:polygon(100%_0,0_100%,100%_100%)]" />
            )}
            
            {/* Background Tech Pattern */}
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white to-transparent" />
          </button>
        );
      })}
    </div>
  );
}
