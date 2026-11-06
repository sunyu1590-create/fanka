import React from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { MobileSessionProvider } from "../lib/mobile-api";
import { ThemeProvider, useTheme } from "../lib/theme";

function RootStack() {
  const { colors, isDark } = useTheme();
  return <><StatusBar style={isDark ? "light" : "dark"} /><Stack screenOptions={{ headerShown: false, animation: "slide_from_right", contentStyle: { backgroundColor: colors.bg }, gestureEnabled: true, fullScreenGestureEnabled: true }} /></>;
}

export default function RootLayout() {
  return <GestureHandlerRootView style={{ flex: 1 }}><SafeAreaProvider><ThemeProvider><MobileSessionProvider><RootStack /></MobileSessionProvider></ThemeProvider></SafeAreaProvider></GestureHandlerRootView>;
}
