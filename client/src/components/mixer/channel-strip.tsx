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
        "flex flex-col items-center gap-2 p-2 rounded-lg bg-slate-300/50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700",
        muted && "opacity-60"
      )}
      data-testid={`channel-strip-${channel}`}
    >
      <span className="text-[10px] text-slate-700 dark:text-slate-400 font-mono truncate w-full text-center">
        {name}
      </span>
      
      <div className="h-32 flex items-center justify-center">
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

      <span className="text-[10px] text-slate-600 dark:text-slate-500 font-mono">
        {dbValue}
      </span>

      <Button
        variant={muted ? "destructive" : "outline"}
        size="sm"
        className="w-full h-7 text-[10px]"
        onClick={() => onMuteToggle(channel, !muted)}
        data-testid={`mute-${channel}`}
      >
        {muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
      </Button>

      <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{channel}</span>
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
