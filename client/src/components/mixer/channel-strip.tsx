import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

interface ChannelStripProps {
  section?: string;
  channel: number;
  name: string;
  fader: number;
  muted: boolean;
  onFaderChange: (channel: number, value: number) => void;
  onMuteToggle: (channel: number, muted: boolean) => void;
}

export function ChannelStrip({ 
  section = "ch",
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

  const handleFaderChange = useCallback((value: number[]) => {
    const newValue = value[0];
    setLocalFader(newValue);
    onFaderChange(channel, newValue);
  }, [channel, onFaderChange]);

  const dbValue = faderToDb(localFader);
  const displayName = name || `${sectionCode(section)} ${channel}`;

  return (
    <div 
      className={cn(
        "grid min-w-16 w-16 grid-rows-[24px_128px_14px_28px_16px] items-center gap-2 p-2 rounded-lg bg-slate-300/50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700",
        muted && "opacity-60"
      )}
      data-testid={`channel-strip-${channel}`}
    >
      <span className="flex h-6 w-full items-center justify-center overflow-hidden text-center text-[10px] leading-3 text-slate-700 dark:text-slate-400 font-mono">
        <span className="line-clamp-2 break-words">{name}</span>
      </span>
      
      <div className="flex h-32 w-full items-center justify-center">
        <Slider
          orientation="vertical"
          value={[localFader]}
          onValueChange={handleFaderChange}
          min={0}
          max={1}
          step={0.01}
          className="h-28"
          data-testid={`fader-${channel}`}
        />
      </div>

      <span className="flex h-3 w-full items-center justify-center text-[10px] leading-none text-slate-600 dark:text-slate-500 font-mono">
        {dbValue}
      </span>

      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-full p-0 min-h-0 text-[10px]"
        onClick={() => onMuteToggle(channel, !muted)}
        data-testid={`mute-${channel}`}
      >
        MUTE
      </Button>

      <span className="flex h-4 items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-300">{channel}</span>
    </div>
  );
}

function sectionCode(section: string): string {
  if (section === "bus") return "BUS";
  if (section === "dca") return "DCA";
  return "CH";
}

function stripToneClass(section: string, channel: number): string {
  if (section === "bus") {
    return channel % 4 === 0
      ? "bg-[linear-gradient(90deg,rgba(19,62,57,0.95),rgba(27,92,76,0.95)_52%,rgba(16,48,47,0.95))]"
      : "bg-[linear-gradient(90deg,rgba(23,45,43,0.95),rgba(32,67,60,0.95)_52%,rgba(18,39,38,0.95))]";
  }

  if (section === "dca") {
    return "bg-[linear-gradient(90deg,rgba(33,39,42,0.98),rgba(48,57,60,0.98)_52%,rgba(26,31,34,0.98))]";
  }

  if (channel % 8 === 0 || channel % 8 === 7) {
    return "bg-[linear-gradient(90deg,rgba(18,58,53,0.95),rgba(27,89,73,0.95)_52%,rgba(17,46,44,0.95))]";
  }

  if (channel % 4 === 0) {
    return "bg-[linear-gradient(90deg,rgba(42,36,34,0.98),rgba(56,45,39,0.98)_52%,rgba(30,27,26,0.98))]";
  }

  return "";
}

function shortStripName(name: string, channel: number): string {
  const trimmed = name.trim();
  if (!trimmed) return String(channel);
  const compact = trimmed
    .replace(/channel/i, "CH")
    .replace(/\s+/g, " ")
    .trim();
  return compact.length <= 5 ? compact : compact.slice(0, 5).toUpperCase();
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
