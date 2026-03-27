import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export type SkinType = "classic" | "broadcast" | "glass" | "command";

interface SkinContextType {
  skin: SkinType;
  setSkin: (skin: SkinType) => void;
}

const SkinContext = createContext<SkinContextType>({
  skin: "classic",
  setSkin: () => {},
});

const STORAGE_KEY = "ptzcommand-skin";

export function SkinProvider({ children }: { children: ReactNode }) {
  const [skin, setSkinState] = useState<SkinType>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && ["classic", "broadcast", "glass", "command"].includes(stored)) {
      return stored as SkinType;
    }
    return "classic";
  });

  const setSkin = (newSkin: SkinType) => {
    setSkinState(newSkin);
    localStorage.setItem(STORAGE_KEY, newSkin);
  };

  return (
    <SkinContext.Provider value={{ skin, setSkin }}>
      {children}
    </SkinContext.Provider>
  );
}

export function useSkin() {
  return useContext(SkinContext);
}
