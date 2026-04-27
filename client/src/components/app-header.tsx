import { Link } from "wouter";
import { ChevronDown, Lock, LogOut } from "lucide-react";
import { ChangelogDialog } from "@/components/changelog-dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { SkinSelector } from "@/components/skin-selector";
import { LayoutSelector } from "@/components/layouts/layout-selector";
import { LogViewer } from "@/components/logs/log-viewer";
import { RehearsalToggle } from "@/components/rehearsal-toggle";
import { BrandLogo } from "@/components/branding/brand";
import { Button } from "@/components/ui/button";
import { useSkin } from "@/lib/skin-context";
import { useAuth } from "@/lib/auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type NavItem = {
  name: string;
  shortName?: string;
  path: string;
  testId?: string;
};

type NavGroup = {
  name: string;
  shortName?: string;
  testId: string;
  items: NavItem[];
};

const PRIMARY_NAV_ITEMS: NavItem[] = [
  { name: "Dashboard", path: "/", testId: "nav-dashboard" },
  { name: "Scenes", path: "/scenes", testId: "nav-scenes" },
  { name: "Runsheet", path: "/runsheet", testId: "nav-runsheet" },
];

const NAV_GROUPS: NavGroup[] = [
  {
    name: "Production",
    shortName: "Prod",
    testId: "nav-production",
    items: [
      { name: "Video Switcher", shortName: "Switcher", path: "/switcher", testId: "nav-switcher" },
      { name: "Audio Mixer", shortName: "Audio", path: "/mixer", testId: "nav-mixer" },
      { name: "Lighting", path: "/lighting", testId: "nav-lighting" },
      { name: "Displays", path: "/displays", testId: "nav-displays" },
    ],
  },
  {
    name: "Tools",
    testId: "nav-tools",
    items: [
      { name: "Macros", path: "/macros", testId: "nav-macros" },
      { name: "Diagnostics", shortName: "Diag", path: "/diagnostics", testId: "nav-diagnostics" },
    ],
  },
];

interface AppHeaderProps {
  activePage: string;
  rightContent?: React.ReactNode;
}

function isActiveItem(activePage: string, item: NavItem) {
  return activePage === item.path;
}

function isActiveGroup(activePage: string, group: NavGroup) {
  return group.items.some((item) => isActiveItem(activePage, item));
}

function NavButton({ item, activePage, className, activeClassName, inactiveClassName, label = item.name }: {
  item: NavItem;
  activePage: string;
  className: string;
  activeClassName: string;
  inactiveClassName: string;
  label?: string;
}) {
  const active = isActiveItem(activePage, item);
  const content = (
    <span className={cn(className, active ? activeClassName : inactiveClassName)} data-testid={item.testId}>
      {label}
    </span>
  );
  return active ? content : <Link href={item.path}>{content}</Link>;
}

function NavGroupMenu({ group, activePage, className, activeClassName, inactiveClassName, itemClassName, label = group.name }: {
  group: NavGroup;
  activePage: string;
  className: string;
  activeClassName: string;
  inactiveClassName: string;
  itemClassName?: string;
  label?: string;
}) {
  const active = isActiveGroup(activePage, group);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className={cn(className, active ? activeClassName : inactiveClassName)} data-testid={group.testId}>
          {label}
          <ChevronDown className="w-3 h-3 ml-1" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {group.items.map((item) => (
          <DropdownMenuItem key={item.path} asChild>
            <Link
              href={item.path}
              className={cn(
                "cursor-pointer",
                activePage === item.path && "bg-accent text-accent-foreground",
                itemClassName
              )}
              data-testid={item.testId}
            >
              {item.name}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserMenu() {
  const { user, isAdmin, logout, logoutPending } = useAuth();

  if (!user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Lock className="h-4 w-4" />
          <span className="max-w-32 truncate">{user.displayName}</span>
          <span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-600 dark:text-cyan-300">
            {user.role}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {isAdmin && (
          <DropdownMenuItem asChild>
            <Link href="/users" className="cursor-pointer">Users</Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => logout()} disabled={logoutPending} className="cursor-pointer">
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ClassicHeader({ activePage, rightContent }: AppHeaderProps) {
  const { isAdmin } = useAuth();
  const navClass = "px-3 py-1.5 rounded text-sm font-medium transition-colors inline-flex items-center";
  const activeClass = "text-slate-900 dark:text-white bg-slate-400/70 dark:bg-slate-800 border border-slate-400 dark:border-slate-700";
  const inactiveClass = "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-400/50 dark:hover:bg-slate-800";

  return (
    <header className="h-14 border-b border-border bg-slate-400/60 dark:bg-slate-950/50 backdrop-blur-md flex items-center justify-between px-6 z-50 relative">
      <div className="flex items-center gap-3 min-w-0">
        <Link href="/">
          <div className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity">
            <div>
              <BrandLogo imageClassName="h-9 w-auto" />
              <ChangelogDialog />
            </div>
          </div>
        </Link>

        <nav className="flex items-center gap-1 ml-4 shrink-0">
          {PRIMARY_NAV_ITEMS.map((item) => (
            <NavButton key={item.path} item={item} activePage={activePage} className={navClass} activeClassName={activeClass} inactiveClassName={inactiveClass} />
          ))}
          {NAV_GROUPS.map((group) => (
            <NavGroupMenu key={group.name} group={group} activePage={activePage} className={navClass} activeClassName={activeClass} inactiveClassName={inactiveClass} />
          ))}
          {isAdmin && <NavButton item={{ name: "Users", path: "/users", testId: "nav-users" }} activePage={activePage} className={navClass} activeClassName={activeClass} inactiveClassName={inactiveClass} />}
        </nav>
      </div>

      <div className="flex items-center gap-3">
        <RehearsalToggle />
        {rightContent}
        <SkinSelector />
        <ThemeToggle />
        <LayoutSelector />
        <LogViewer />
        <UserMenu />
      </div>
    </header>
  );
}

function BroadcastHeader({ activePage, rightContent }: AppHeaderProps) {
  const { isAdmin } = useAuth();
  const navClass = "px-3 py-1.5 transition-colors inline-flex items-center";
  const activeClass = "bg-[#252535] text-cyan-400 border-t-2 border-cyan-400";
  const inactiveClass = "text-zinc-400 hover:text-zinc-100 hover:bg-[#1e1e2a]";

  return (
    <header className="h-12 bg-[#16161e] border-b border-[#2a2a3a] flex items-center justify-between px-4 shrink-0 z-50 relative shadow-lg font-mono text-xs uppercase tracking-wider">
      <div className="flex items-center space-x-4 min-w-0">
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]"></div>
          <Link href="/">
            <span className="cursor-pointer hover:opacity-85 transition-opacity">
              <BrandLogo imageClassName="h-7 w-auto brightness-110" />
            </span>
          </Link>
        </div>
        <nav className="flex space-x-1">
          {PRIMARY_NAV_ITEMS.map((item) => (
            <NavButton key={item.path} item={item} activePage={activePage} className={navClass} activeClassName={activeClass} inactiveClassName={inactiveClass} label={item.path === "/runsheet" ? "Run" : item.name} />
          ))}
          {NAV_GROUPS.map((group) => (
            <NavGroupMenu key={group.name} group={group} activePage={activePage} className={navClass} activeClassName={activeClass} inactiveClassName={inactiveClass} label={group.shortName || group.name} />
          ))}
          {isAdmin && <NavButton item={{ name: "Users", shortName: "Users", path: "/users", testId: "nav-users" }} activePage={activePage} className={navClass} activeClassName={activeClass} inactiveClassName={inactiveClass} label="Users" />}
        </nav>
      </div>
      <div className="flex items-center space-x-4 text-[10px] text-zinc-400">
        <RehearsalToggle />
        {rightContent}
        <ThemeToggle />
        <SkinSelector />
        <UserMenu />
      </div>
    </header>
  );
}

function GlassHeader({ activePage, rightContent }: AppHeaderProps) {
  const { isAdmin } = useAuth();
  const navClass = "px-3 py-2 rounded text-sm font-medium transition-colors inline-flex items-center";
  const activeClass = "bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 shadow-sm";
  const inactiveClass = "text-slate-500 dark:text-slate-400 hover:bg-slate-100/50 dark:hover:bg-slate-800/50 hover:text-slate-800 dark:hover:text-slate-200";

  return (
    <header className="h-14 bg-white/70 dark:bg-slate-800/60 backdrop-blur-xl border-b border-white/50 dark:border-slate-700/50 shadow-lg flex items-center justify-between px-6 z-50 relative">
      <div className="flex items-center gap-3 min-w-0">
        <Link href="/">
          <div className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity">
            <BrandLogo imageClassName="h-10 w-auto" />
          </div>
        </Link>

        <nav className="flex items-center gap-1 ml-4 shrink-0">
          {PRIMARY_NAV_ITEMS.map((item) => (
            <NavButton key={item.path} item={item} activePage={activePage} className={navClass} activeClassName={activeClass} inactiveClassName={inactiveClass} />
          ))}
          {NAV_GROUPS.map((group) => (
            <NavGroupMenu key={group.name} group={group} activePage={activePage} className={navClass} activeClassName={activeClass} inactiveClassName={inactiveClass} />
          ))}
          {isAdmin && <NavButton item={{ name: "Users", path: "/users", testId: "nav-users" }} activePage={activePage} className={navClass} activeClassName={activeClass} inactiveClassName={inactiveClass} />}
        </nav>
      </div>

      <div className="flex items-center gap-3">
        <RehearsalToggle />
        {rightContent}
        <ThemeToggle />
        <SkinSelector />
        <UserMenu />
      </div>
    </header>
  );
}

function CommandHeader({ activePage, rightContent }: AppHeaderProps) {
  const { isAdmin } = useAuth();
  const navClass = "px-3 py-1.5 text-xs font-semibold rounded-full transition-colors inline-flex items-center";
  const activeClass = "bg-amber-500/20 text-amber-400";
  const inactiveClass = "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50";

  return (
    <header className="h-14 border-b border-slate-800 bg-[#0f172a]/80 backdrop-blur flex items-center justify-between px-4 z-50 shrink-0 relative">
      <div className="flex items-center gap-6">
        <Link href="/">
          <div className="flex items-center gap-2 cursor-pointer hover:opacity-85 transition-opacity">
            <BrandLogo imageClassName="h-8 w-auto" />
          </div>
        </Link>

        <nav className="hidden md:flex gap-1 bg-[#020617] p-1 rounded-full border border-slate-800 font-mono">
          {PRIMARY_NAV_ITEMS.map((item) => (
            <NavButton key={item.path} item={item} activePage={activePage} className={navClass} activeClassName={activeClass} inactiveClassName={inactiveClass} label={item.path === "/" ? "DASHBOARD" : item.path === "/runsheet" ? "RUN" : item.name.toUpperCase()} />
          ))}
          {NAV_GROUPS.map((group) => (
            <NavGroupMenu key={group.name} group={group} activePage={activePage} className={navClass} activeClassName={activeClass} inactiveClassName={inactiveClass} label={(group.shortName || group.name).toUpperCase()} />
          ))}
          {isAdmin && <NavButton item={{ name: "Users", path: "/users", testId: "nav-users" }} activePage={activePage} className={navClass} activeClassName={activeClass} inactiveClassName={inactiveClass} label="USERS" />}
        </nav>
      </div>

      <div className="flex items-center gap-4 text-xs font-mono">
        <RehearsalToggle />
        {rightContent}
        <ThemeToggle />
        <SkinSelector />
        <UserMenu />
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
