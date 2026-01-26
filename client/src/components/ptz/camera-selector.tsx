import { cn } from "@/lib/utils";
import { Camera, Wifi, WifiOff } from "lucide-react";

export interface CameraData {
  id: number;
  name: string;
  ip: string;
  status: 'online' | 'offline' | 'tally';
}

interface CameraSelectorProps {
  cameras: CameraData[];
  previewId: number;
  programId: number;
  onSelectPreview: (id: number) => void;
  onSelectProgram: (id: number) => void;
}

export function CameraSelector({ cameras, previewId, programId, onSelectPreview, onSelectProgram }: CameraSelectorProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full">
      {cameras.map((cam) => {
        const isPreview = previewId === cam.id;
        const isProgram = programId === cam.id;
        const isOnline = cam.status !== 'offline';
        // Tally logic: If it's in PROGRAM, it's tally. Or if the camera reports tally.
        const isTally = cam.status === 'tally' || isProgram;

        return (
          <div
            key={cam.id}
            onClick={() => onSelectPreview(cam.id)}
            className={cn(
              "relative flex flex-col items-start p-4 h-32 rounded-lg border transition-all duration-200 group overflow-hidden cursor-pointer",
              isProgram 
                ? "bg-red-950/20 border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.25)]" 
                : isPreview
                  ? "bg-emerald-950/20 border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.25)]"
                  : "bg-slate-900/50 border-slate-800 hover:border-slate-700 hover:bg-slate-800/50"
            )}
          >
            {/* Status Indicator */}
            <div className="absolute top-3 right-3 flex items-center gap-2">
              <span className={cn(
                "text-[10px] font-mono uppercase tracking-wider",
                isTally ? "text-red-500 font-bold" : isPreview ? "text-emerald-500 font-bold" : "text-slate-500"
              )}>
                {isTally ? "PGM" : isPreview ? "PVW" : cam.status}
              </span>
              <div className={cn(
                "w-2 h-2 rounded-full",
                isTally ? "bg-red-500 animate-pulse shadow-[0_0_8px_red]" : 
                isPreview ? "bg-emerald-500 shadow-[0_0_8px_emerald]" :
                isOnline ? "bg-slate-600" : "bg-red-900"
              )} />
            </div>

            {/* Icon */}
            <div className={cn(
              "mb-auto p-2 rounded-md transition-colors",
              isProgram ? "bg-red-500/10 text-red-400" :
              isPreview ? "bg-emerald-500/10 text-emerald-400" : 
              "bg-slate-800 text-slate-500"
            )}>
              {isOnline ? <Camera className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
            </div>

            {/* Info */}
            <div className="text-left z-10 w-full">
              <div className="flex justify-between items-end">
                <div>
                  <div className="font-mono text-xs text-slate-500 mb-0.5">{cam.ip}</div>
                  <div className={cn(
                    "font-bold text-lg leading-none tracking-tight",
                    isProgram ? "text-red-100" :
                    isPreview ? "text-emerald-100" :
                    "text-slate-300"
                  )}>
                    {cam.name}
                  </div>
                </div>
                
                {/* Manual Cut Button (Direct to PGM if needed) */}
                {!isProgram && (
                   <button 
                     onClick={(e) => {
                       e.stopPropagation();
                       onSelectProgram(cam.id);
                     }}
                     className="opacity-0 group-hover:opacity-100 transition-opacity bg-red-500/20 hover:bg-red-500 text-red-200 hover:text-white text-[10px] font-bold px-2 py-1 rounded border border-red-500/50 uppercase"
                   >
                     CUT
                   </button>
                )}
              </div>
            </div>

            {/* Selection Corner */}
            {(isPreview || isProgram) && (
              <div className={cn(
                "absolute bottom-0 right-0 w-4 h-4 [clip-path:polygon(100%_0,0_100%,100%_100%)]",
                isProgram ? "bg-red-500" : "bg-emerald-500"
              )} />
            )}
            
            {/* Background Tech Pattern */}
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white to-transparent" />
          </div>
        );
      })}
    </div>
  );
}
