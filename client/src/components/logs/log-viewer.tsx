import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, RefreshCw, AlertCircle, AlertTriangle, Info, Bug } from "lucide-react";
import { cn } from "@/lib/utils";

interface LogEntry {
  id?: number;
  timestamp: string;
  level: string;
  category: string;
  message: string;
  action?: string;
  details?: string;
}

async function fetchLogs(limit: number, category?: string): Promise<LogEntry[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (category && category !== "all") {
    params.append("category", category);
  }
  const res = await fetch(`/api/logs?${params}`);
  if (!res.ok) throw new Error("Failed to fetch logs");
  return res.json();
}

const levelIcons: Record<string, React.ReactNode> = {
  error: <AlertCircle className="h-4 w-4 text-red-500" />,
  warn: <AlertTriangle className="h-4 w-4 text-amber-500" />,
  info: <Info className="h-4 w-4 text-blue-500" />,
  debug: <Bug className="h-4 w-4 text-slate-500" />,
};

const levelColors: Record<string, string> = {
  error: "text-red-400 bg-red-500/10",
  warn: "text-amber-400 bg-amber-500/10",
  info: "text-blue-400 bg-blue-500/10",
  debug: "text-slate-400 bg-slate-500/10",
};

export function LogViewer() {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("all");

  const { data: logs = [], refetch, isLoading } = useQuery({
    queryKey: ["logs", category],
    queryFn: () => fetchLogs(100, category),
    enabled: open,
    refetchInterval: open ? 5000 : false,
  });

  const formatTimestamp = (ts: string) => {
    const date = new Date(ts);
    return date.toLocaleTimeString();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white" data-testid="button-open-logs">
          <FileText className="h-4 w-4 mr-1" />
          Logs
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-slate-900 border-slate-700 max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>System Logs</span>
            <div className="flex items-center gap-2">
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-32 h-8 bg-slate-800 border-slate-600" data-testid="select-log-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-600">
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="camera">Camera</SelectItem>
                  <SelectItem value="mixer">Mixer</SelectItem>
                  <SelectItem value="switcher">Switcher</SelectItem>
                  <SelectItem value="api">API</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                </SelectContent>
              </Select>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => refetch()}
                disabled={isLoading}
                data-testid="button-refresh-logs"
              >
                <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="h-[60vh] mt-4">
          <div className="space-y-1 font-mono text-sm">
            {logs.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                No logs found
              </div>
            ) : (
              logs.map((log, index) => (
                <div
                  key={log.id || index}
                  className={cn(
                    "flex items-start gap-2 px-2 py-1 rounded",
                    levelColors[log.level] || "text-slate-400"
                  )}
                  data-testid={`log-entry-${index}`}
                >
                  <span className="flex-shrink-0 mt-0.5">
                    {levelIcons[log.level] || levelIcons.info}
                  </span>
                  <span className="text-slate-500 flex-shrink-0 w-20">
                    {formatTimestamp(log.timestamp)}
                  </span>
                  <span className="text-slate-600 flex-shrink-0 w-20 uppercase text-xs">
                    [{log.category}]
                  </span>
                  <span className="flex-1">{log.message}</span>
                  {log.action && (
                    <span className="text-slate-600 text-xs">
                      {log.action}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
