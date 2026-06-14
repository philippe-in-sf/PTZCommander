import { createContext, useContext } from "react";
import type { DeviceSetupType } from "@shared/device-setup-wizard";

export interface DeviceSetupOpenOptions {
  type?: DeviceSetupType;
}

export interface DeviceSetupContextValue {
  isDeviceSetupOpen: boolean;
  openDeviceSetup: (options?: DeviceSetupOpenOptions) => void;
  closeDeviceSetup: () => void;
}

export const DeviceSetupContext = createContext<DeviceSetupContextValue | null>(null);

export function useDeviceSetup() {
  const context = useContext(DeviceSetupContext);
  if (!context) {
    throw new Error("useDeviceSetup must be used within DeviceSetupProvider");
  }
  return context;
}
