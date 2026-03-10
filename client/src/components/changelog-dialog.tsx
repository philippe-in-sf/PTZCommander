import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { APP_VERSION } from "@shared/version";

function parseChangelog(raw: string) {
  const sections: { version: string; date: string; entries: { category: string; items: string[] }[] }[] = [];
  let current: (typeof sections)[0] | null = null;
  let currentCategory: { category: string; items: string[] } | null = null;

  for (const line of raw.split("\n")) {
    const versionMatch = line.match(/^## \[(.+?)\] - (.+)$/);
    if (versionMatch) {
      if (current) sections.push(current);
      current = { version: versionMatch[1], date: versionMatch[2], entries: [] };
      currentCategory = null;
      continue;
    }
    const categoryMatch = line.match(/^### (.+)$/);
    if (categoryMatch && current) {
      currentCategory = { category: categoryMatch[1], items: [] };
      current.entries.push(currentCategory);
      continue;
    }
    const itemMatch = line.match(/^- (.+)$/);
    if (itemMatch && currentCategory) {
      currentCategory.items.push(itemMatch[1]);
    }
  }
  if (current) sections.push(current);
  return sections;
}

export function ChangelogDialog() {
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["/api/changelog"],
    queryFn: async () => {
      const res = await fetch("/api/changelog");
      if (!res.ok) throw new Error("Failed to load changelog");
      const json = await res.json();
      return json.changelog as string;
    },
    enabled: open,
  });

  const sections = data ? parseChangelog(data) : [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <button
                className="text-xs font-semibold text-cyan-500/80 italic tracking-widest hover:text-cyan-400 hover:underline transition-colors cursor-pointer"
                data-testid="button-changelog"
              >
                v{APP_VERSION}
              </button>
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="bg-slate-800 text-slate-200 text-xs border-slate-700">
            View changelog
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto bg-slate-900 border-slate-700 text-white">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">
            PTZ<span className="text-cyan-500 font-light">COMMAND</span>{" "}
            <span className="text-sm text-slate-400 font-normal">Changelog</span>
          </DialogTitle>
        </DialogHeader>
        {isLoading && <p className="text-slate-400 text-sm py-4">Loading...</p>}
        {sections.length > 0 && (
          <div className="space-y-5 mt-2" data-testid="changelog-content">
            {sections.map((section) => (
              <div key={section.version}>
                <div className="flex items-baseline gap-2 mb-1.5">
                  <span className="text-sm font-bold text-cyan-500">v{section.version}</span>
                  <span className="text-xs text-slate-500">{section.date}</span>
                </div>
                {section.entries.map((entry) => (
                  <div key={entry.category} className="mb-1.5">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-0.5">{entry.category}</p>
                    <ul className="space-y-0.5">
                      {entry.items.map((item, i) => (
                        <li key={i} className="text-xs text-slate-300 pl-3 relative before:content-['•'] before:absolute before:left-0 before:text-cyan-600">
                          {item.replace(/\*\*(.+?)\*\*/g, "$1")}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
