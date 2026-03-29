import { useQuery } from "@tanstack/react-query";
import { Lightbulb, Wifi, WifiOff } from "lucide-react";
import { Link } from "wouter";
import type { HueBridge } from "@shared/schema";

export function HuePanel() {
  const { data: bridges = [] } = useQuery<HueBridge[]>({
    queryKey: ["/api/hue/bridges"],
    refetchInterval: 15000,
  });

  const onlineBridges = bridges.filter(b => b.status === "online");
  const offlineBridges = bridges.filter(b => b.status !== "online");

  return (
    <div className="bg-slate-200/80 dark:bg-slate-800/80 rounded-lg p-3 border border-slate-300/60 dark:border-slate-700/60">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Lightbulb className="w-3.5 h-3.5 text-yellow-500" />
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">Lighting</span>
        </div>
        <Link href="/lighting">
          <button className="text-xs text-cyan-600 dark:text-cyan-400 hover:underline" data-testid="button-lighting-manage">
            Manage →
          </button>
        </Link>
      </div>

      {bridges.length === 0 ? (
        <div className="text-xs text-slate-500 dark:text-slate-400 py-1">
          No bridges configured
        </div>
      ) : (
        <div className="space-y-1">
          {bridges.map(bridge => (
            <div key={bridge.id} className="flex items-center justify-between" data-testid={`hue-bridge-status-${bridge.id}`}>
              <span className="text-xs text-slate-600 dark:text-slate-300 truncate max-w-[120px]">{bridge.name}</span>
              <div className="flex items-center gap-1">
                {bridge.status === "online" ? (
                  <>
                    <Wifi className="w-3 h-3 text-yellow-500" />
                    <span className="text-xs text-yellow-600 dark:text-yellow-400">Online</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="w-3 h-3 text-slate-400" />
                    <span className="text-xs text-slate-400">{bridge.apiKey ? "Offline" : "Not paired"}</span>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {onlineBridges.length > 0 && (
        <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          {onlineBridges.length} bridge{onlineBridges.length !== 1 ? "s" : ""} online
          {offlineBridges.length > 0 && `, ${offlineBridges.length} offline`}
        </div>
      )}
    </div>
  );
}
