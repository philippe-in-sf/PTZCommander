import { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";

interface ChannelStripProps {
  channel: number;
  name: string;
  fader: number;
  muted: boolean;
  onFaderChange: (channel: number, value: number) => void;
  onMuteToggle: (channel: number, muted: boolean) => void;
}

export function ChannelStrip({ 
  channel, 
  name, 
  fader, 
  muted, 
  onFaderChange, 
  onMuteToggle 
}: ChannelStripProps) {
  const [localFader, setLocalFader] = useState(fader);

  useEffect(() => {
    setLocalFader(fader);
  }, [fader]);

  const handleFaderChange = useCallback((value: number) => {
    setLocalFader(value);
    onFaderChange(channel, value);
  }, [channel, onFaderChange]);

  const dbValue = faderToDb(localFader);

  return (
    <div 
      className={cn(
        "flex flex-col items-center flex-shrink-0 bg-[#1e1e32] border border-[#2a2a3e] px-1 py-2",
        muted && "opacity-50"
      )}
      style={{ width: 52 }}
      data-testid={`channel-strip-${channel}`}
    >
      <span className="text-[9px] font-bold text-slate-300 truncate w-full text-center mb-1 tracking-wide" title={name}>
        {name}
      </span>

      <span className="text-[8px] font-mono text-green-400 mb-1">
        {dbValue}
      </span>
      
      <div className="flex items-center justify-center flex-1 my-1">
        <PanelFader
          value={localFader}
          onChange={handleFaderChange}
          height={140}
        />
      </div>

      <button
        onClick={() => onMuteToggle(channel, !muted)}
        className={cn(
          "w-full py-1 text-[8px] font-bold tracking-wider border transition-colors mt-1",
          muted
            ? "bg-red-600 border-red-500 text-white"
            : "bg-[#2a2a3e] border-[#3a3a4e] text-slate-500 hover:text-slate-300 hover:bg-[#3a3a4e]"
        )}
        data-testid={`mute-${channel}`}
      >
        MUTE
      </button>

      <span className="text-[9px] font-bold text-slate-400 mt-1">{channel}</span>
    </div>
  );
}

interface PanelFaderProps {
  value: number;
  onChange: (value: number) => void;
  height?: number;
}

function PanelFader({ value, onChange, height = 140 }: PanelFaderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const knobHeight = 22;
  const trackPadding = 4;
  const usableHeight = height - knobHeight - trackPadding * 2;
  const knobTop = trackPadding + (1 - value) * usableHeight;

  const updateValue = useCallback((e: React.PointerEvent) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top - trackPadding - knobHeight / 2;
    const ratio = 1 - Math.max(0, Math.min(1, y / usableHeight));
    onChange(Math.round(ratio * 100) / 100);
  }, [usableHeight, onChange]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    isDragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updateValue(e);
  }, [updateValue]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (isDragging.current) updateValue(e);
  }, [updateValue]);

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  const fillHeight = value * usableHeight;

  return (
    <div
      ref={trackRef}
      className="relative cursor-pointer select-none touch-none"
      style={{ width: 32, height }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div
        className="absolute left-1/2 -translate-x-1/2 rounded-sm"
        style={{
          width: 4,
          top: trackPadding,
          bottom: trackPadding,
          background: 'linear-gradient(to bottom, #1a1a2e, #0f0f1a)',
          boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5)',
        }}
      />

      <div
        className="absolute left-1/2 -translate-x-1/2 rounded-sm"
        style={{
          width: 4,
          bottom: trackPadding,
          height: fillHeight,
          background: 'linear-gradient(to top, #22c55e, #16a34a)',
          opacity: 0.7,
        }}
      />

      <div
        className="absolute left-1/2 -translate-x-1/2"
        style={{
          width: 26,
          height: knobHeight,
          top: knobTop,
          background: 'linear-gradient(to bottom, #5a5a6e, #3a3a4e, #2a2a3e)',
          borderRadius: 2,
          boxShadow: '0 1px 4px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.15)',
        }}
      >
        <div
          className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2"
          style={{
            width: 16,
            height: 2,
            background: 'rgba(255,255,255,0.3)',
            borderRadius: 1,
          }}
        />
      </div>
    </div>
  );
}

function faderToDb(value: number): string {
  if (value <= 0) return "-inf";
  if (value >= 1) return "+10";
  if (value >= 0.75) {
    const db = ((value - 0.75) / 0.25) * 10;
    return db >= 0 ? `+${db.toFixed(0)}` : db.toFixed(0);
  }
  const db = -60 + (value / 0.75) * 60;
  return db.toFixed(0);
}
