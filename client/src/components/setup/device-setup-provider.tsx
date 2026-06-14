import { useCallback, useMemo, useState } from "react";
import { DeviceSetupContext, type DeviceSetupOpenOptions } from "@/hooks/use-device-setup";
import { useAuth } from "@/lib/auth";
import { DeviceSetupWizard } from "./device-setup-wizard";
import type { DeviceSetupType } from "@shared/device-setup-wizard";

interface DeviceSetupState {
  open: boolean;
  initialType: DeviceSetupType | null;
  key: number;
}

export function DeviceSetupProvider({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useAuth();
  const [state, setState] = useState<DeviceSetupState>({
    open: false,
    initialType: null,
    key: 0,
  });

  const closeDeviceSetup = useCallback(() => {
    setState((current) => ({ ...current, open: false }));
  }, []);

  const openDeviceSetup = useCallback((options: DeviceSetupOpenOptions = {}) => {
    setState((current) => ({
      open: true,
      initialType: options.type ?? null,
      key: current.key + 1,
    }));
  }, []);

  const value = useMemo(
    () => ({
      isDeviceSetupOpen: state.open,
      openDeviceSetup,
      closeDeviceSetup,
    }),
    [closeDeviceSetup, openDeviceSetup, state.open],
  );

  return (
    <DeviceSetupContext.Provider value={value}>
      {children}
      <DeviceSetupWizard
        key={state.key}
        open={state.open}
        initialType={state.initialType}
        canCreate={isAdmin}
        onOpenChange={(open) => {
          if (!open) closeDeviceSetup();
        }}
      />
    </DeviceSetupContext.Provider>
  );
}
