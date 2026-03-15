import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Camera, Video, VideoOff, Maximize2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { Camera as CameraType } from "@shared/schema";

interface CameraPreviewProps {
  cameras: CameraType[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  refreshInterval?: number;
}

function CameraFeed({ camera, isSelected, onSelect, refreshInterval = 2000 }: {
  camera: CameraType;
  isSelected: boolean;
  onSelect: () => void;
  refreshInterval: number;
}) {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const hasStream = !!camera.streamUrl;

  useEffect(() => {
    if (!hasStream) return;

    const loadImage = () => {
      const timestamp = Date.now();
      const url = `/api/cameras/${camera.id}/snapshot?t=${timestamp}`;
      const img = new Image();
      img.onload = () => {
        setImgSrc(url);
        setError(false);
        setLoading(false);
      };
      img.onerror = () => {
        setError(true);
        setLoading(false);
      };
      img.src = url;
    };

    loadImage();
    timerRef.current = setInterval(loadImage, refreshInterval);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [camera.id, camera.streamUrl, refreshInterval, hasStream]);

  const tallyState = camera.tallyState || (camera.isProgramOutput ? "program" : camera.isPreviewOutput ? "preview" : "off");
  const isPgm = tallyState === "program";
  const isPvw = tallyState === "preview";

  return (
    <>
      <div
        onClick={onSelect}
        className={cn(
          "relative rounded-lg border overflow-hidden cursor-pointer transition-all group aspect-video",
          isPgm
            ? "border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.3)]"
            : isPvw
            ? "border-green-500 shadow-[0_0_20px_rgba(34,197,94,0.3)]"
            : isSelected
            ? "border-cyan-500 shadow-[0_0_20px_rgba(6,182,212,0.25)]"
            : "border-slate-300 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-600"
        )}
        data-testid={`camera-preview-${camera.id}`}
      >
        {hasStream && imgSrc && !error ? (
          <img
            src={imgSrc}
            alt={camera.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-slate-300 dark:bg-slate-900 flex items-center justify-center">
            {hasStream && loading ? (
              <div className="animate-pulse text-slate-400 dark:text-slate-600">
                <Video className="w-8 h-8" />
              </div>
            ) : hasStream && error ? (
              <div className="text-center">
                <VideoOff className="w-6 h-6 text-slate-400 dark:text-slate-700 mx-auto" />
                <p className="text-[10px] text-slate-400 dark:text-slate-700 mt-1">No signal</p>
              </div>
            ) : (
              <div className="text-center">
                <Camera className="w-6 h-6 text-slate-400 dark:text-slate-700 mx-auto" />
                <p className="text-[10px] text-slate-400 dark:text-slate-700 mt-1">No stream URL</p>
              </div>
            )}
          </div>
        )}

        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-2 py-1 bg-gradient-to-b from-black/70 to-transparent">
          <span className={cn(
            "text-[10px] font-mono font-bold uppercase tracking-wider",
            isPgm ? "text-red-400" : isPvw ? "text-green-400" : isSelected ? "text-cyan-400" : "text-white/70"
          )}>
            {camera.name}
          </span>
          <div className="flex items-center gap-1">
            {isPgm && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-600 text-white">PGM</span>
            )}
            {isPvw && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-green-600 text-white">PVW</span>
            )}
            {isSelected && !isPgm && !isPvw && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-cyan-600 text-white">SEL</span>
            )}
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-2 py-1 bg-gradient-to-t from-black/70 to-transparent">
          <span className="text-[9px] font-mono text-white/40">{camera.ip}</span>
          <div className={cn(
            "w-1.5 h-1.5 rounded-full",
            camera.status === "online" ? "bg-green-500" : "bg-red-800"
          )} />
        </div>

        {hasStream && imgSrc && !error && (
          <button
            onClick={(e) => { e.stopPropagation(); setFullscreen(true); }}
            className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded bg-black/50 text-white/70 hover:text-white"
            data-testid={`camera-fullscreen-${camera.id}`}
          >
            <Maximize2 className="w-3 h-3" />
          </button>
        )}
      </div>

      <Dialog open={fullscreen} onOpenChange={setFullscreen}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden bg-black border-slate-300 dark:border-slate-800">
          {imgSrc && (
            <div className="relative">
              <img src={imgSrc} alt={camera.name} className="w-full" />
              <div className="absolute top-3 left-3 text-sm font-mono font-bold text-white bg-black/50 px-2 py-1 rounded">
                {camera.name}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function CameraPreview({ cameras, selectedId, onSelect, refreshInterval = 2000 }: CameraPreviewProps) {
  return (
    <div className="bg-slate-400/30 dark:bg-slate-900/30 border border-slate-300 dark:border-slate-800 rounded-xl p-4">
      <h3 className="text-xs font-mono uppercase text-slate-400 dark:text-slate-500 tracking-widest mb-3 flex items-center gap-2">
        <Video className="w-3 h-3" /> Camera Preview
      </h3>
      <div className={cn(
        "grid gap-3",
        cameras.length <= 2 ? "grid-cols-2" : "grid-cols-2 lg:grid-cols-4"
      )}>
        {cameras.map(camera => (
          <CameraFeed
            key={camera.id}
            camera={camera}
            isSelected={selectedId === camera.id}
            onSelect={() => onSelect(camera.id)}
            refreshInterval={refreshInterval}
          />
        ))}
      </div>
    </div>
  );
}
