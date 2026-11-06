import React from "react";
import { ArrowLeft, Bell, Bookmark, Camera, ChevronRight, Compass, Crown, Heart, House, LayoutGrid, MessageSquare, PenLine, Plus, Search, Settings, Sparkles, UserRound, X } from "lucide-react-native";
import { View, type ViewStyle } from "react-native";
import type { LucideIcon } from "lucide-react-native";

export type NativeIconName = "home" | "compass" | "plus" | "message" | "user" | "search" | "bell" | "settings" | "chevron-right" | "edit" | "bookmark" | "heart" | "back" | "grid" | "camera" | "close" | "sparkles" | "crown";
const icons: Record<NativeIconName, LucideIcon> = {
  home: House, compass: Compass, plus: Plus, message: MessageSquare, user: UserRound, search: Search, bell: Bell, settings: Settings,
  "chevron-right": ChevronRight, edit: PenLine, bookmark: Bookmark, heart: Heart, back: ArrowLeft, grid: LayoutGrid, camera: Camera, close: X, sparkles: Sparkles, crown: Crown,
};

export function NativeIcon({ name, color = "#E8ECEA", size = 22, style }: { name: NativeIconName; color?: string; size?: number; style?: ViewStyle }) {
  const Icon = icons[name];
  return <View accessibilityElementsHidden pointerEvents="none" style={[{ width: size, height: size, alignItems: "center", justifyContent: "center" }, style]}><Icon size={size} color={color} strokeWidth={1.8} /></View>;
}
