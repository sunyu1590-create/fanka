import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";

export type ThemeMode = "system" | "light" | "dark";
export type ThemeColors = {
  bg: string; surface: string; raised: string; ink: string; muted: string; subtle: string;
  line: string; action: string; actionSoft: string; gold: string; danger: string;
};

const light: ThemeColors = {
  bg: "#F6F5F1", surface: "#FFFFFF", raised: "#F0F1ED", ink: "#202421", muted: "#737B78",
  subtle: "#9AA09C", line: "#E2E4DF", action: "#49665F", actionSoft: "#E8EEEA", gold: "#C5A84A", danger: "#A9473D",
};
const dark: ThemeColors = {
  bg: "#0E1112", surface: "#171B1D", raised: "#202628", ink: "#E8ECEA", muted: "#A4AEAA",
  subtle: "#7D8984", line: "#2A3234", action: "#9BB7AE", actionSoft: "#24312D", gold: "#D0B453", danger: "#E28B80",
};

type ThemeContextValue = { mode: ThemeMode; colors: ThemeColors; isDark: boolean; setMode: (mode: ThemeMode) => void };
const ThemeContext = createContext<ThemeContextValue>({ mode: "system", colors: light, isDark: false, setMode: () => undefined });
const THEME_KEY = "heika:preferences:theme:v1";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("system");
  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(THEME_KEY).then((value) => {
      if (active && (value === "system" || value === "light" || value === "dark")) setModeState(value);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  const setMode = (value: ThemeMode) => {
    setModeState(value);
    void AsyncStorage.setItem(THEME_KEY, value).catch(() => undefined);
  };
  const isDark = mode === "dark" || (mode === "system" && systemScheme === "dark");
  const value = useMemo(() => ({ mode, colors: isDark ? dark : light, isDark, setMode }), [mode, isDark]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() { return useContext(ThemeContext); }
