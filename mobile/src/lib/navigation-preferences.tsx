import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type BottomNavStyle = "glass" | "fixed";
const STORAGE_KEY = "heika-bottom-nav-style";
type ContextValue = { style: BottomNavStyle; setStyle: (value: BottomNavStyle) => void };
const Context = createContext<ContextValue>({ style: "glass", setStyle: () => undefined });

export function NavigationPreferencesProvider({ children }: { children: ReactNode }) {
  const [style, setStyleState] = useState<BottomNavStyle>("glass");
  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(STORAGE_KEY).then((value) => {
      if (active && (value === "glass" || value === "fixed")) setStyleState(value);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  const setStyle = (value: BottomNavStyle) => {
    setStyleState(value);
    void AsyncStorage.setItem(STORAGE_KEY, value).catch(() => undefined);
  };
  const context = useMemo(() => ({ style, setStyle }), [style]);
  return <Context.Provider value={context}>{children}</Context.Provider>;
}

export function useBottomNavStyle() { return useContext(Context); }
