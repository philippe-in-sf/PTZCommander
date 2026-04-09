import { Link } from "wouter";
import { Video, Radio } from "lucide-react";
import { ChangelogDialog } from "@/components/changelog-dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { SkinSelector } from "@/components/skin-selector";
import { LayoutSelector } from "@/components/layouts/layout-selector";
import { LogViewer } from "@/components/logs/log-viewer";
import { useSkin } from "@/lib/skin-context";

const NAV_ITEMS = [
  { name: "Dashboard", path: "/", testId: "nav-dashboard" },
  { name: "Scenes", path: "/scenes", testId: "nav-scenes" },
  { name: "Macros", path: "/macros", testId: "nav-macros" },
  { name: "Video Switcher", path: "/switcher", testId: "nav-switcher" },
  { name: "Audio Mixer", path: "/mixer", testId: "nav-mixer" },
  { name: "Lighting", path: "/lighting", testId: "nav-lighting" },
];

interface AppHeaderProps {
  activePage: string;
  rightContent?: React.ReactNode;
}

function ClassicHeader({ activePage, rightContent }: AppHeaderProps) {
  return (
    <header className="h-14 border-b border-border bg-slate-400/60 dark:bg-slate-950/50 backdrop-blur-md flex items-center justify-between px-6 z-50 relative">
      <div className="flex items-center gap-3">
        <Link href="/">
          <div className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 rounded bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.4)]">
              <Video className="text-white w-4 h-4" />
            </div>
            <div>
              <h1 className="font-bold tracking-tight text-lg leading-none">
                PTZ<span className="text-cyan-500 font-light">COMMAND</span>
              </h1>
              <ChangelogDialog />
            </div>
          </div>
        </Link>

        <nav className="flex items-center gap-1 ml-6">
          {NAV_ITEMS.map((item) => {
            const isActive = activePage === item.path;
            return isActive ? (
              <button key={item.name} className="px-3 py-1.5 rounded text-sm font-medium text-slate-900 dark:text-white bg-slate-400/70 dark:bg-slate-800 border border-slate-400 dark:border-slate-700" data-testid={item.testId}>
                {item.name}
              </button>
            ) : (
              <Link key={item.name} href={item.path}>
                <button className="px-3 py-1.5 rounded text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-400/50 dark:hover:bg-slate-800 transition-colors" data-testid={item.testId}>
                  {item.name}
                </button>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="flex items-center gap-3">
        {rightContent}
        <SkinSelector />
        <ThemeToggle />
        <LayoutSelector />
        <LogViewer />
      </div>
    </header>
  );
}

const BROADCAST_TABS = [
  { name: "Dashboard", path: "/" },
  { name: "Scenes", path: "/scenes" },
  { name: "Macros", path: "/macros" },
  { name: "Switcher", path: "/switcher" },
  { name: "Audio", path: "/mixer" },
  { name: "Lighting", path: "/lighting" },
];

function BroadcastHeader({ activePage, rightContent }: AppHeaderProps) {
  return (
    <header className="h-12 bg-[#16161e] border-b border-[#2a2a3a] flex items-center justify-between px-4 shrink-0 z-50 relative shadow-lg font-mono text-xs uppercase tracking-wider">
      <div className="flex items-center space-x-6">
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]"></div>
          <Link href="/">
            <span className="text-red-400 font-bold tracking-widest text-sm cursor-pointer hover:text-red-300 transition-colors">PTZCOMMAND</span>
          </Link>
        </div>
        <nav className="flex space-x-1">
          {BROADCAST_TABS.map((tab) => {
            const isActive = activePage === tab.path;
            return (
              <Link key={tab.name} href={tab.path} className={`px-4 py-1.5 ${isActive ? 'bg-[#252535] text-cyan-400 border-t-2 border-cyan-400' : 'text-zinc-400 hover:text-zinc-100 hover:bg-[#1e1e2a]'} transition-colors block`}>
                {tab.name}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="flex items-center space-x-4 text-[10px] text-zinc-400">
        {rightContent}
        <ThemeToggle />
        <SkinSelector />
      </div>
    </header>
  );
}

const GLASS_NAV = [
  { name: "Dashboard", path: "/" },
  { name: "Scenes", path: "/scenes" },
  { name: "Macros", path: "/macros" },
  { name: "Video Switcher", path: "/switcher" },
  { name: "Audio Mixer", path: "/mixer" },
  { name: "Lighting", path: "/lighting" },
];

function GlassHeader({ activePage, rightContent }: AppHeaderProps) {
  return (
    <header className="h-14 bg-white/70 dark:bg-slate-800/60 backdrop-blur-xl border-b border-white/50 dark:border-slate-700/50 shadow-lg flex items-center justify-between px-6 z-50 relative">
      <div className="flex items-center gap-3">
        <Link href="/">
          <div className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity">
            <div className="w-10 h-10 rounded-xl bg-indigo-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/30">
              <Radio className="w-5 h-5" />
            </div>
            <h1 className="font-bold text-xl tracking-tight text-slate-900 dark:text-white">PTZCOMMAND</h1>
          </div>
        </Link>

        <nav className="flex items-center gap-1 ml-6">
          {GLASS_NAV.map((item) => {
            const isActive = activePage === item.path;
            return isActive ? (
              <button key={item.name} className="px-4 py-2 rounded-2xl text-sm font-medium bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 shadow-sm">
                {item.name}
              </button>
            ) : (
              <Link key={item.name} href={item.path}>
                <button className="px-4 py-2 rounded-2xl text-sm font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100/50 dark:hover:bg-slate-800/50 hover:text-slate-800 dark:hover:text-slate-200 transition-colors">
                  {item.name}
                </button>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="flex items-center gap-3">
        {rightContent}
        <ThemeToggle />
        <SkinSelector />
      </div>
    </header>
  );
}

const COMMAND_TABS = [
  { name: "DASHBOARD", path: "/" },
  { name: "SCENES", path: "/scenes" },
  { name: "MACROS", path: "/macros" },
  { name: "VIDEO", path: "/switcher" },
  { name: "AUDIO", path: "/mixer" },
  { name: "LIGHTS", path: "/lighting" },
];

function CommandHeader({ activePage, rightContent }: AppHeaderProps) {
  return (
    <header className="h-14 border-b border-slate-800 bg-[#0f172a]/80 backdrop-blur flex items-center justify-between px-4 z-50 shrink-0 relative">
      <div className="flex items-center gap-6">
        <Link href="/">
          <div className="flex items-center gap-2 text-amber-500 font-bold tracking-widest text-lg cursor-pointer hover:text-amber-400 transition-colors font-mono">
            <Radio className="w-5 h-5 animate-pulse" />
            <span>PTZCOMMAND<span className="text-slate-600">_</span></span>
          </div>
        </Link>

        <nav className="hidden md:flex gap-1 bg-[#020617] p-1 rounded-full border border-slate-800 font-mono">
          {COMMAND_TABS.map((tab) => {
            const isActive = activePage === tab.path;
            return (
              <Link key={tab.name} href={tab.path}>
                <span className={`px-4 py-1.5 text-xs font-semibold rounded-full transition-colors block cursor-pointer ${isActive ? 'bg-amber-500/20 text-amber-400' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}>
                  {tab.name}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="flex items-center gap-4 text-xs font-mono">
        {rightContent}
        <ThemeToggle />
        <SkinSelector />
      </div>
    </header>
  );
}

export function AppHeader({ activePage, rightContent }: AppHeaderProps) {
  const { skin } = useSkin();

  switch (skin) {
    case "broadcast":
      return <BroadcastHeader activePage={activePage} rightContent={rightContent} />;
    case "glass":
      return <GlassHeader activePage={activePage} rightContent={rightContent} />;
    case "command":
      return <CommandHeader activePage={activePage} rightContent={rightContent} />;
    default:
      return <ClassicHeader activePage={activePage} rightContent={rightContent} />;
  }
}
