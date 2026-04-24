import { useEffect, useState } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { SkinProvider } from "@/lib/skin-context";
import { AuthProvider, useAuth } from "@/lib/auth";
import { useWsInvalidation } from "@/lib/ws-invalidation";
import { rehearsalApi } from "@/lib/api";
import { ErrorBoundary } from "@/components/error-boundary";
import Dashboard from "@/pages/dashboard";
import MixerPage from "@/pages/mixer";
import SwitcherPage from "@/pages/switcher";
import ScenesPage from "@/pages/scenes";
import MacrosPage from "@/pages/macros";
import RunsheetPage from "@/pages/runsheet";
import MobilePage from "@/pages/mobile";
import LightingPage from "@/pages/lighting";
import DisplaysPage from "@/pages/displays";
import DiagnosticsPage from "@/pages/diagnostics";
import UsersPage from "@/pages/users";
import LoginPage from "@/pages/login";
import NotFound from "@/pages/not-found";
import { StartupSplash } from "@/components/branding/brand";

function WsSync({ children }: { children: React.ReactNode }) {
  useWsInvalidation();
  return <>{children}</>;
}

function RehearsalChrome() {
  const { data } = useQuery({
    queryKey: ["rehearsal"],
    queryFn: rehearsalApi.get,
  });
  const enabled = data?.enabled ?? false;

  return (
    <>
      {enabled && (
        <div className="fixed inset-x-0 top-0 z-[200] flex h-9 items-center justify-center border-b border-red-300 bg-red-600 px-3 text-center text-xs font-black uppercase tracking-[0.14em] text-white shadow-lg">
          REHEARSAL MODE - ATEM, OBS, and X32 live outputs suppressed - VISCA cameras still move
        </div>
      )}
      <div className={enabled ? "pt-9" : ""}>
        <Router />
      </div>
    </>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard}/>
      <Route path="/scenes" component={ScenesPage}/>
      <Route path="/macros" component={MacrosPage}/>
      <Route path="/runsheet" component={RunsheetPage}/>
      <Route path="/mixer" component={MixerPage}/>
      <Route path="/switcher" component={SwitcherPage}/>
      <Route path="/mobile" component={MobilePage}/>
      <Route path="/lighting" component={LightingPage}/>
      <Route path="/displays" component={DisplaysPage}/>
      <Route path="/diagnostics" component={DiagnosticsPage}/>
      <Route path="/users" component={UsersPage}/>
      <Route component={NotFound} />
    </Switch>
  );
}

function Shell() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return null;
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <WsSync>
      <RehearsalChrome />
    </WsSync>
  );
}

function App() {
  const [showStartupSplash, setShowStartupSplash] = useState(true);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setShowStartupSplash(false);
    }, 1400);

    return () => window.clearTimeout(timeout);
  }, []);

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <SkinProvider>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <TooltipProvider>
                <Toaster />
                <SonnerToaster />
                <Shell />
              </TooltipProvider>
            </AuthProvider>
          </QueryClientProvider>
        </SkinProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
