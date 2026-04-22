import { useSkin } from "@/lib/skin-context";
import { AppHeader } from "@/components/app-header";
import { BrandWatermark } from "@/components/branding/brand";

interface AppLayoutProps {
  activePage: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}

export function AppLayout({ activePage, headerRight, children }: AppLayoutProps) {
  const { skin } = useSkin();

  const bgClass = (() => {
    switch (skin) {
      case "broadcast":
        return "bg-[#0c0c10] text-zinc-200";
      case "glass":
        return "bg-[#f8fafc] dark:bg-[#0f172a] text-slate-800 dark:text-slate-200";
      case "command":
        return "bg-[#0a1628] text-slate-200";
      default:
        return "bg-background text-foreground";
    }
  })();

  return (
    <div className={`relative min-h-screen flex flex-col overflow-hidden ${bgClass}`}>
      <AppHeader activePage={activePage} rightContent={headerRight} />
      <BrandWatermark />
      {children}
    </div>
  );
}
