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
        "mixer-console-strip flex min-h-[292px] min-w-[52px] flex-col items-center border border-black bg-[linear-gradient(90deg,#171b1f,#22272b_48%,#15191d)] px-1 py-1.5 shadow-[inset_1px_0_0_rgba(255,255,255,0.04),inset_-1px_0_0_rgba(0,0,0,0.75)]",
        stripToneClass(section, channel),
        muted && "opacity-70"
      )}
      data-testid={`channel-strip-${channel}`}
    >
      <div className="grid w-full gap-1">
        <div className="h-5 truncate rounded-sm border border-black/70 bg-[#23282c] px-1 text-center font-mono text-[10px] leading-5 text-zinc-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]" title={displayName}>
          {displayName}
        </div>
        <div className="grid grid-cols-2 gap-1">
          <span className="rounded-sm border border-black/70 bg-[#30363a] text-center font-mono text-[9px] leading-4 text-zinc-400">
            {sectionCode(section)}
          </span>
          <span className="rounded-sm border border-black/70 bg-[#30363a] text-center font-mono text-[9px] leading-4 text-zinc-400">
            {channel}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1">
          <span className="rounded-sm border border-black/70 bg-[#202529] text-center font-mono text-[9px] leading-4 text-zinc-500">
            EQ
          </span>
          <span className="rounded-sm border border-black/70 bg-[#202529] text-center font-mono text-[9px] leading-4 text-zinc-500">
            DYN
          </span>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-center">
        <div className="mixer-fader-well relative flex h-[170px] w-9 items-center justify-center rounded-sm border border-black bg-[#101316] shadow-[inset_0_0_18px_rgba(0,0,0,0.75)]">
          <div className="absolute inset-y-3 left-1 w-px bg-zinc-500/30" />
          <div className="absolute inset-y-3 right-1 w-px bg-zinc-500/30" />
          <div className="absolute left-1.5 right-1.5 top-1/2 h-px bg-sky-300/35" />
          <Slider
            orientation="vertical"
            value={[localFader]}
            onValueChange={handleFaderChange}
            min={0}
            max={1}
            step={0.01}
            className="mixer-console-slider h-[150px] w-7"
            data-testid={`fader-${channel}`}
          />
        </div>
      </div>

      <span className="mt-1 h-4 font-mono text-[9px] leading-4 text-zinc-400">
        {dbValue}
      </span>

      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "mt-1 h-6 min-h-0 w-full rounded-sm border px-1 font-mono text-[9px]",
          muted
            ? "border-red-500/80 bg-red-600 text-white"
            : "border-black bg-[#2d3337] text-zinc-200"
        )}
        onClick={() => onMuteToggle(channel, !muted)}
        data-testid={`mute-${channel}`}
      >
        MUTE
      </Button>

      <div className="mt-1 h-6 w-full truncate rounded-sm border border-black bg-[#1b2227] px-1 text-center font-mono text-[10px] leading-6 text-zinc-300" title={displayName}>
        {shortStripName(displayName, channel)}
      </div>
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
