import React, { createContext, useContext, useState, useCallback, useMemo } from "react";
import { useColorScheme } from "react-native";
import { LIGHT, DARK, Palette } from "./theme";

type ThemeMode = "light" | "dark";

type ThemeCtx = {
  mode: ThemeMode;
  colors: Palette;
  isDark: boolean;
  setMode: (m: ThemeMode) => void;
  toggle: () => void;
};

const Ctx = createContext<ThemeCtx | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>(system === "dark" ? "dark" : "light");

  const setMode = useCallback((m: ThemeMode) => setModeState(m), []);
  const toggle = useCallback(() => setModeState((p) => (p === "dark" ? "light" : "dark")), []);

  const value = useMemo<ThemeCtx>(
    () => ({
      mode,
      colors: mode === "dark" ? DARK : LIGHT,
      isDark: mode === "dark",
      setMode,
      toggle,
    }),
    [mode, setMode, toggle],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTheme must be used within ThemeProvider");
  return c;
}
