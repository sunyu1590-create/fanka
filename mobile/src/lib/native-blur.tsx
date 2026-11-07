import React, { createContext, useContext, useRef, type ComponentRef, type ReactNode, type RefObject } from "react";
import { View } from "react-native";
import { BlurTargetView } from "expo-blur";

type BlurTargetRef = RefObject<ComponentRef<typeof View> | null>;
const NativeBlurContext = createContext<BlurTargetRef | null>(null);

export function NativeBlurProvider({ children }: { children: ReactNode }) {
  const target = useRef<ComponentRef<typeof View>>(null);
  return <BlurTargetView ref={target} style={{ flex: 1 }}><NativeBlurContext.Provider value={target}>{children}</NativeBlurContext.Provider></BlurTargetView>;
}

export function useNativeBlurTarget() { return useContext(NativeBlurContext); }
