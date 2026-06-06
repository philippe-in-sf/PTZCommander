import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, CheckCircle2, Gauge, Server } from "lucide-react";
import { healthApi, type DeviceHealthResponse, type SystemHealthResponse } from "@/lib/api";
import { cn } from "@/lib/utils";

type OperatorStatusStripProps = {
  className?: string;
  compact?: boolean;
  tone?: "default" | "broadcast" | "glass" | "command";
};

function formatPercent(value: number | undefined) {
  if (!Number.isFinite(value)) return "--";
  return `${Math.round(value!)}%`;
}

export function OperatorStatusStrip({ className, compact = false, tone = "default" }: OperatorStatusStripProps) {
  const { data: deviceHealth } = useQuery<DeviceHealthResponse>({
    queryKey: ["health-devices"],
    queryFn: healthApi.getDevices,
    refetchInterval: 5000,
  });
  const { data: systemHealth } = useQuery<SystemHealthResponse>({
    queryKey: ["health-system"],
    queryFn: healthApi.getSystem,
    refetchInterval: 10000,
  });

  const devices = [
    ...(deviceHealth?.switchers || []),
    ...(deviceHealth?.cameras || []),
    ...(deviceHealth?.mixers || []),
    ...(deviceHealth?.displays || []),
  ];
  const offlineCount = devices.filter((device) => device.status !== "online" && device.status !== "connected").length;
  const onlineCount = devices.length - offlineCount;
  const allOnline = devices.length > 0 && offlineCount === 0;

  const toneClass = {
    default: "border-slate-400/40 bg-slate-200/60 text-slate-700 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-300",
    broadcast: "border-[#303044] bg-[#111119] text-zinc-300",
    glass: "border-white/50 bg-white/55 text-slate-700 dark:border-slate-700/50 dark:bg-slate-800/50 dark:text-slate-200",
    command: "border-slate-800 bg-[#020617] text-slate-300",
  }[tone];

  return (
    <div className={cn(
      "inline-flex items-center gap-2 rounded border px-2.5 py-1 text-[11px] font-medium",
      compact ? "gap-1.5 px-2 py-0.5 text-[10px]" : "",
      toneClass,
      className,
    )}>
      <span className={cn("inline-flex items-center gap-1", allOnline ? "text-emerald-500" : "text-amber-500")}>
        {allOnline ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
        <span className="tabular-nums">{onlineCount}/{devices.length || 0}</span>
      </span>
      <span className="h-3 w-px bg-current opacity-20" />
      <span className="inline-flex items-center gap-1">
        <Gauge className="h-3.5 w-3.5 opacity-70" />
        <span className="tabular-nums">{formatPercent(systemHealth?.cpuPercent)}</span>
      </span>
      {!compact && (
        <>
          <span className="h-3 w-px bg-current opacity-20" />
          <span className="inline-flex items-center gap-1">
            <Server className="h-3.5 w-3.5 opacity-70" />
            <span className="tabular-nums">{offlineCount} offline</span>
          </span>
        </>
      )}
      {devices.length === 0 && (
        <>
          <span className="h-3 w-px bg-current opacity-20" />
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Activity className="h-3.5 w-3.5" />
            no devices
          </span>
        </>
      )}
    </div>
  );
}
