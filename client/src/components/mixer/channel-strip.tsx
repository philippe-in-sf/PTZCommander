import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

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

  const handleFaderChange = useCallback((value: number[]) => {
    const newValue = value[0];
    setLocalFader(newValue);
    onFaderChange(channel, newValue);
  }, [channel, onFaderChange]);

  const dbValue = faderToDb(localFader);

  return (
    <div 
      className={cn(
        "flex h-64 w-20 shrink-0 flex-col items-center gap-2 rounded-lg border border-slate-300 bg-slate-300/50 p-2 dark:border-slate-700 dark:bg-slate-800/50",
        muted && "opacity-60"
      )}
      data-testid={`channel-strip-${channel}`}
    >
      <span className="block h-4 w-full truncate text-center font-mono text-[10px] leading-4 text-slate-700 dark:text-slate-400" title={name}>
        {name}
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

      <span className="h-4 font-mono text-[10px] leading-4 text-slate-600 dark:text-slate-500">
        {dbValue}
      </span>

      <Button
        variant={muted ? "destructive" : "outline"}
        size="sm"
        className="h-7 w-full text-[10px]"
        onClick={() => onMuteToggle(channel, !muted)}
        data-testid={`mute-${channel}`}
      >
        {muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
      </Button>

      <span className="mt-auto flex h-4 items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-300">{channel}</span>
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
