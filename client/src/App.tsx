import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { SkinProvider } from "@/lib/skin-context";
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
import NotFound from "@/pages/not-found";

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
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <SkinProvider>
          <QueryClientProvider client={queryClient}>
            <TooltipProvider>
              <WsSync>
                <Toaster />
                <RehearsalChrome />
              </WsSync>
            </TooltipProvider>
          </QueryClientProvider>
        </SkinProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
