import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { sessionLogApi } from "@/lib/api";
import { useWebSocket } from "@/lib/websocket";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollText, Trash2, Camera, Tv, Music, Clapperboard, Layout, Settings, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

const categoryIcons: Record<string, any> = {
  camera: Camera,
  preset: Camera,
  scene: Zap,
  switcher: Tv,
  mixer: Music,
  macro: Clapperboard,
  layout: Layout,
  system: Settings,
};

const categoryColors: Record<string, string> = {
  camera: "text-cyan-500",
  preset: "text-cyan-400",
  scene: "text-amber-500",
  switcher: "text-purple-500",
  mixer: "text-green-500",
  macro: "text-pink-500",
  layout: "text-blue-500",
  system: "text-slate-400",
};

export function SessionLog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<any[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const ws = useWebSocket();

  const { data: initialEntries = [] } = useQuery({
    queryKey: ["session-log"],
    queryFn: sessionLogApi.getAll,
    enabled: open,
  });

  useEffect(() => {
    if (initialEntries.length > 0) {
      setEntries(initialEntries);
    }
  }, [initialEntries]);

  useEffect(() => {
    if (!ws) return;
    const handler = (msg: any) => {
      if (msg.type === "session_log" && msg.entry) {
        setEntries(prev => [...prev, msg.entry]);
      }
    };
    ws.addMessageHandler(handler);
    return () => ws.removeMessageHandler(handler);
  }, [ws]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries]);

  const handleClear = async () => {
    await sessionLogApi.clear();
    setEntries([]);
    queryClient.invalidateQueries({ queryKey: ["session-log"] });
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium bg-slate-300/60 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
        data-testid="button-session-log"
      >
        <ScrollText className="w-3.5 h-3.5" />
        Session Log
        {entries.length > 0 && (
          <span className="ml-1 bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
            {entries.length}
          </span>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <ScrollText className="w-5 h-5 text-cyan-500" /> Session Log
              </span>
              {entries.length > 0 && (
                <Button variant="ghost" size="sm" className="text-xs text-red-500 hover:text-red-400 gap-1" onClick={handleClear} data-testid="button-clear-session-log">
                  <Trash2 className="w-3 h-3" /> Clear
                </Button>
              )}
            </DialogTitle>
          </DialogHeader>

          <div ref={scrollRef} className="flex-1 overflow-auto min-h-0 max-h-[60vh] space-y-0.5">
            {entries.length === 0 ? (
              <div className="text-center py-12 text-slate-400 dark:text-slate-600 text-sm">
                No activity yet this session. Actions you take will appear here.
              </div>
            ) : (
              entries.map((entry, idx) => {
                const Icon = categoryIcons[entry.category] || Settings;
                const colorClass = categoryColors[entry.category] || "text-slate-400";

                return (
                  <div
                    key={entry.id || idx}
                    className="flex items-start gap-2 px-3 py-2 rounded-md hover:bg-slate-400/20 dark:hover:bg-slate-800/50 transition-colors"
                    data-testid={`session-log-entry-${entry.id || idx}`}
                  >
                    <Icon className={cn("w-3.5 h-3.5 mt-0.5 shrink-0", colorClass)} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-xs font-medium truncate">{entry.action}</span>
                        <span className="text-[10px] text-slate-400 dark:text-slate-600 shrink-0 font-mono">{formatTime(entry.timestamp)}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-500 truncate">{entry.details}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
