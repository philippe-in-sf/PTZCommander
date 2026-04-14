import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Activity, AlertTriangle, CheckCircle2, Lightbulb, RefreshCw, Server, Video, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppLayout } from "@/components/app-layout";
import { healthApi } from "@/lib/api";
import { cn } from "@/lib/utils";

type DeviceHealth = {
  type: "camera" | "mixer" | "switcher";
  id: number;
  name: string;
  ip: string;
  port?: number;
  status: "online" | "offline" | string;
  tallyState?: string;
};

type HealthResponse = {
  cameras: DeviceHealth[];
  mixers: DeviceHealth[];
  switchers: DeviceHealth[];
  timestamp: number;
};

type HueBridgeStatus = {
  id: number;
  name: string;
  ip: string;
  status: string;
  apiKey?: string | null;
};

type RecentLog = {
  timestamp?: string | number;
  level?: string;
  category?: string;
  message?: string;
};

function StatusPill({ status }: { status: string }) {
  const online = status === "online" || status === "connected";
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium",
      online ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300" : "bg-rose-500/15 text-rose-600 dark:text-rose-300"
    )}>
      {online ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
      {status}
    </span>
  );
}

function DeviceRow({ device, icon }: { device: DeviceHealth; icon: ReactNode }) {
  return (
    <div className="border border-slate-300 dark:border-slate-800 rounded-lg p-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="text-slate-500 dark:text-slate-400">{icon}</div>
        <div className="min-w-0">
          <p className="font-semibold truncate">{device.name}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {device.ip}{device.port ? `:${device.port}` : ""}
            {device.tallyState ? ` / tally ${device.tallyState}` : ""}
          </p>
        </div>
      </div>
      <StatusPill status={device.status} />
    </div>
  );
}

export default function DiagnosticsPage() {
  const healthQuery = useQuery<HealthResponse>({
    queryKey: ["health-devices"],
    queryFn: healthApi.getDevices,
  });
  const hueQuery = useQuery<HueBridgeStatus[]>({
    queryKey: ["/api/hue/bridges"],
  });
  const logsQuery = useQuery<RecentLog[]>({
    queryKey: ["/api/logs/recent"],
  });

  const health = healthQuery.data;
  const devices = [
    ...(health?.switchers || []),
    ...(health?.cameras || []),
    ...(health?.mixers || []),
  ];
  const bridgeCount = hueQuery.data?.length || 0;
  const offlineBridgeCount = hueQuery.data?.filter((bridge) => bridge.status !== "online").length || 0;
  const offlineDeviceCount = devices.filter((device) => device.status !== "online").length;

  const refreshAll = () => {
    healthQuery.refetch();
    hueQuery.refetch();
    logsQuery.refetch();
  };

  return (
    <AppLayout activePage="/diagnostics">
      <main className="flex-1 p-6 flex flex-col gap-6 max-w-7xl mx-auto w-full">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Activity className="w-5 h-5 text-cyan-500" /> Diagnostics
            </h2>
            <p className="text-sm text-slate-500 mt-1">Device health, Hue bridge status, and recent system events.</p>
          </div>
          <Button variant="outline" onClick={refreshAll} disabled={healthQuery.isFetching || hueQuery.isFetching || logsQuery.isFetching}>
            <RefreshCw className={cn("w-4 h-4 mr-2", (healthQuery.isFetching || hueQuery.isFetching || logsQuery.isFetching) && "animate-spin")} />
            Refresh
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="border border-slate-300 dark:border-slate-800 rounded-lg p-4">
            <p className="text-xs uppercase font-mono text-slate-500 dark:text-slate-400">Hardware Offline</p>
            <p className="text-3xl font-bold mt-2">{offlineDeviceCount}</p>
          </div>
          <div className="border border-slate-300 dark:border-slate-800 rounded-lg p-4">
            <p className="text-xs uppercase font-mono text-slate-500 dark:text-slate-400">Hue Bridges</p>
            <p className="text-3xl font-bold mt-2">{bridgeCount}</p>
          </div>
          <div className="border border-slate-300 dark:border-slate-800 rounded-lg p-4">
            <p className="text-xs uppercase font-mono text-slate-500 dark:text-slate-400">Hue Offline</p>
            <p className="text-3xl font-bold mt-2">{offlineBridgeCount}</p>
          </div>
        </div>

        <section className="space-y-3">
          <h3 className="font-semibold flex items-center gap-2"><Server className="w-4 h-4 text-cyan-500" /> Device Health</h3>
          {devices.length === 0 ? (
            <p className="text-sm text-slate-500">No cameras, switchers, or mixers configured.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {devices.map((device) => (
                <DeviceRow
                  key={`${device.type}-${device.id}`}
                  device={device}
                  icon={device.type === "mixer" ? <Volume2 className="w-4 h-4" /> : <Video className="w-4 h-4" />}
                />
              ))}
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="font-semibold flex items-center gap-2"><Lightbulb className="w-4 h-4 text-yellow-500" /> Hue Bridges</h3>
          {hueQuery.data?.length === 0 ? (
            <p className="text-sm text-slate-500">No Hue bridges configured.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {(hueQuery.data || []).map((bridge) => (
                <div key={bridge.id} className="border border-slate-300 dark:border-slate-800 rounded-lg p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{bridge.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{bridge.ip} / {bridge.apiKey ? "paired" : "not paired"}</p>
                  </div>
                  <StatusPill status={bridge.status} />
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="font-semibold">Recent Events</h3>
          <div className="border border-slate-300 dark:border-slate-800 rounded-lg divide-y divide-slate-300 dark:divide-slate-800">
            {(logsQuery.data || []).slice(-8).reverse().map((log, index) => (
              <div key={`${log.timestamp}-${index}`} className="p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{log.category || "system"} / {log.level || "info"}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : ""}</span>
                </div>
                <p className="text-slate-600 dark:text-slate-300 mt-1">{log.message}</p>
              </div>
            ))}
            {logsQuery.data?.length === 0 && <p className="p-3 text-sm text-slate-500">No recent events.</p>}
          </div>
        </section>
      </main>
    </AppLayout>
  );
}
