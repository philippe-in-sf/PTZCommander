import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Dashboard from "@/pages/dashboard";
import MixerPage from "@/pages/mixer";
import SwitcherPage from "@/pages/switcher";
import ScenesPage from "@/pages/scenes";
import MobilePage from "@/pages/mobile";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard}/>
      <Route path="/scenes" component={ScenesPage}/>
      <Route path="/mixer" component={MixerPage}/>
      <Route path="/switcher" component={SwitcherPage}/>
      <Route path="/mobile" component={MobilePage}/>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
