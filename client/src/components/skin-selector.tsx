import { useSkin, type SkinType } from "@/lib/skin-context";
import { Palette } from "lucide-react";
import { useState } from "react";

const SKINS: { value: SkinType; label: string }[] = [
  { value: "classic", label: "Classic" },
  { value: "broadcast", label: "Broadcast Console" },
  { value: "glass", label: "Studio Glass" },
  { value: "command", label: "Command Center" },
];

export function SkinSelector() {
  const { skin, setSkin } = useSkin();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative" data-testid="skin-selector" onMouseLeave={() => setOpen(false)}>
      <button
        className="w-8 h-8 rounded-md flex items-center justify-center border border-slate-300 dark:border-slate-700 bg-slate-300 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
        aria-label="Change skin"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        data-testid="button-skin-selector"
      >
        <Palette className="w-4 h-4 text-slate-600 dark:text-slate-400" />
      </button>
      <div className={`absolute right-0 top-full mt-1 w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl transition-all z-50 ${open ? "opacity-100 visible" : "opacity-0 invisible"}`}>
        <div className="p-1">
          {SKINS.map((s) => (
            <button
              key={s.value}
              onClick={() => {
                setSkin(s.value);
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                skin === s.value
                  ? "bg-cyan-100 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-400 font-medium"
                  : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
              data-testid={`button-skin-${s.value}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
