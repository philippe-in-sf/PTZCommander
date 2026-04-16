import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { SkinProvider } from "@/lib/skin-context";
import { useWsInvalidation } from "@/lib/ws-invalidation";
import { ErrorBoundary } from "@/components/error-boundary";
import Dashboard from "@/pages/dashboard";
import MixerPage from "@/pages/mixer";
import SwitcherPage from "@/pages/switcher";
import ScenesPage from "@/pages/scenes";
import MacrosPage from "@/pages/macros";
import MobilePage from "@/pages/mobile";
import LightingPage from "@/pages/lighting";
import DisplaysPage from "@/pages/displays";
import DiagnosticsPage from "@/pages/diagnostics";
import NotFound from "@/pages/not-found";

function WsSync({ children }: { children: React.ReactNode }) {
  useWsInvalidation();
  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard}/>
      <Route path="/scenes" component={ScenesPage}/>
      <Route path="/macros" component={MacrosPage}/>
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
                <Router />
              </WsSync>
            </TooltipProvider>
          </QueryClientProvider>
        </SkinProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
