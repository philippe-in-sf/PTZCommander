import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { healthApi } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Activity, Camera, Tv, Music, Wifi, WifiOff, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";

export function ConnectionHealth() {
  const [open, setOpen] = useState(false);

  const { data: health } = useQuery({
    queryKey: ["health-devices"],
    queryFn: healthApi.getDevices,
    refetchInterval: open ? 5000 : 30000,
  });

  const totalDevices = (health?.cameras?.length || 0) + (health?.mixers?.length || 0) + (health?.switchers?.length || 0) + (health?.displays?.length || 0);
  const onlineDevices = [
    ...(health?.cameras || []),
    ...(health?.mixers || []),
    ...(health?.switchers || []),
    ...(health?.displays || []),
  ].filter((d: any) => d.status === "online").length;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium border transition-colors",
          totalDevices === 0
            ? "bg-slate-300/60 dark:bg-slate-800/60 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-400"
            : onlineDevices === totalDevices
              ? "bg-emerald-100/50 dark:bg-emerald-950/30 border-emerald-300/50 dark:border-emerald-900/50 text-emerald-600 dark:text-emerald-500"
              : onlineDevices > 0
                ? "bg-amber-100/50 dark:bg-amber-950/30 border-amber-300/50 dark:border-amber-900/50 text-amber-600 dark:text-amber-500"
                : "bg-red-100/50 dark:bg-red-950/30 border-red-300/50 dark:border-red-900/50 text-red-600 dark:text-red-500"
        )}
        data-testid="button-connection-health"
      >
        <Activity className="w-3.5 h-3.5" />
        {totalDevices === 0 ? "No Devices" : `${onlineDevices}/${totalDevices}`}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-cyan-500" /> Connection Health
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {(!health || totalDevices === 0) && (
              <div className="text-center py-8 text-slate-600 dark:text-slate-600 text-sm">
                No devices configured. Add cameras, a mixer, a switcher, or a display to see their status.
              </div>
            )}

            {health?.cameras?.length > 0 && (
              <div>
                <h3 className="text-xs font-mono uppercase text-slate-700 dark:text-slate-400 tracking-widest mb-2 flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5" /> Cameras
                </h3>
                <div className="space-y-1.5">
                  {health.cameras.map((cam: any) => (
                    <DeviceRow
                      key={`cam-${cam.id}`}
                      name={cam.name}
                      ip={`${cam.ip}:${cam.port}`}
                      status={cam.status}
                      extra={cam.tallyState !== "off" ? cam.tallyState.toUpperCase() : undefined}
                      extraColor={cam.tallyState === "program" ? "text-red-500" : cam.tallyState === "preview" ? "text-green-500" : undefined}
                      testId={`health-camera-${cam.id}`}
                    />
                  ))}
                </div>
              </div>
            )}

            {health?.mixers?.length > 0 && (
              <div>
                <h3 className="text-xs font-mono uppercase text-slate-700 dark:text-slate-400 tracking-widest mb-2 flex items-center gap-1.5">
                  <Music className="w-3.5 h-3.5" /> Audio Mixers
                </h3>
                <div className="space-y-1.5">
                  {health.mixers.map((m: any) => (
                    <DeviceRow
                      key={`mix-${m.id}`}
                      name={m.name}
                      ip={`${m.ip}:${m.port}`}
                      status={m.status}
                      testId={`health-mixer-${m.id}`}
                    />
                  ))}
                </div>
              </div>
            )}

            {health?.switchers?.length > 0 && (
              <div>
                <h3 className="text-xs font-mono uppercase text-slate-700 dark:text-slate-400 tracking-widest mb-2 flex items-center gap-1.5">
                  <Tv className="w-3.5 h-3.5" /> Video Switchers
                </h3>
                <div className="space-y-1.5">
                  {health.switchers.map((s: any) => (
                    <DeviceRow
                      key={`sw-${s.id}`}
                      name={s.name}
                      ip={s.ip}
                      status={s.status}
                      testId={`health-switcher-${s.id}`}
                    />
                  ))}
                </div>
              </div>
            )}

            {health?.displays?.length > 0 && (
              <div>
                <h3 className="text-xs font-mono uppercase text-slate-700 dark:text-slate-400 tracking-widest mb-2 flex items-center gap-1.5">
                  <Monitor className="w-3.5 h-3.5" /> Displays
                </h3>
                <div className="space-y-1.5">
                  {health.displays.map((display: any) => (
                    <DeviceRow
                      key={`display-${display.id}`}
                      name={display.name}
                      ip={display.ip || display.inputSource || "SmartThings"}
                      status={display.status}
                      extra={display.powerState}
                      testId={`health-display-${display.id}`}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function DeviceRow({ name, ip, status, extra, extraColor, testId }: {
  name: string;
  ip: string;
  status: "online" | "offline";
  extra?: string;
  extraColor?: string;
  testId: string;
}) {
  const online = status === "online";

  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-lg border px-3 py-2.5 transition-all",
        online
          ? "border-emerald-300/40 dark:border-emerald-900/40 bg-emerald-50/30 dark:bg-emerald-950/10"
          : "border-red-300/40 dark:border-red-900/40 bg-red-50/30 dark:bg-red-950/10"
      )}
      data-testid={testId}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div className={cn(
          "w-2.5 h-2.5 rounded-full shrink-0",
          online ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]" : "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.4)]"
        )} />
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{name}</div>
          <div className="text-[10px] text-slate-600 dark:text-slate-600 font-mono">{ip}</div>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {extra && (
          <span className={cn("text-[10px] font-bold", extraColor)}>{extra}</span>
        )}
        <div className={cn("flex items-center gap-1 text-xs font-medium", online ? "text-emerald-600 dark:text-emerald-500" : "text-red-600 dark:text-red-500")}>
          {online ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
          {online ? "Online" : "Offline"}
        </div>
      </div>
    </div>
  );
}
