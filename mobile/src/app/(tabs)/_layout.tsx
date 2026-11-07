import React from "react";
import { Tabs } from "expo-router";
import type { BottomTabBarProps } from "expo-router/build/layouts/Tabs";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { BlurView } from "expo-blur";
import { useTheme } from "../../lib/theme";
import { useBottomNavStyle } from "../../lib/navigation-preferences";
import { NativeIcon, type NativeIconName } from "../../components/NativeIcon";
import { useNativeBlurTarget } from "../../lib/native-blur";

const items: Record<string, { label: string; icon: NativeIconName }> = {
  home: { label: "首页", icon: "home" },
  discover: { label: "发现", icon: "compass" },
  publish: { label: "发布", icon: "plus" },
  messages: { label: "消息", icon: "message" },
  me: { label: "我的", icon: "user" },
};

function NativeTabBar({ state, descriptors, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { style: navStyle } = useBottomNavStyle();
  const blurTarget = useNativeBlurTarget();
  const floating = navStyle === "glass";
  return <Animated.View entering={FadeIn.duration(220)} style={{ position: "absolute", left: floating ? 12 : 0, right: floating ? 12 : 0, bottom: floating ? Math.max(insets.bottom, 8) : 0, height: floating ? 68 : 68 + insets.bottom, paddingBottom: floating ? 5 : insets.bottom, flexDirection: "row", alignItems: "center", justifyContent: "space-around", paddingHorizontal: floating ? 5 : 10, paddingTop: 4, backgroundColor: floating ? "transparent" : colors.surface, borderWidth: floating ? 1 : 0, borderTopWidth: 1, borderColor: colors.line, borderRadius: floating ? 21 : 0, overflow: "hidden", shadowColor: "#000000", shadowOpacity: floating ? 0.22 : 0.08, shadowRadius: floating ? 18 : 8, shadowOffset: { width: 0, height: floating ? 8 : -3 }, elevation: floating ? 14 : 8, zIndex: 100 }}>
    {floating && blurTarget ? <BlurView pointerEvents="none" blurTarget={blurTarget} blurMethod="dimezisBlurViewSdk31Plus" intensity={42} tint={isDark ? "dark" : "light"} style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, borderRadius: 21, backgroundColor: isDark ? "#171B1D55" : "#F6F5F155" }} /> : null}
    {state.routes.map((route, index) => {
      const item = items[route.name];
      if (!item) return null;
      const focused = state.index === index;
      const central = route.name === "publish";
      const options = descriptors[route.key]?.options;
      const label = typeof options?.tabBarLabel === "string" ? options.tabBarLabel : item.label;
      return <TabButton key={route.key} label={label} icon={item.icon} focused={focused} central={central} color={central ? colors.ink : focused ? colors.action : colors.muted} background={colors.gold} onPress={() => navigateToTab(route.key)} />;
    })}
  </Animated.View>;
}

function TabButton({ label, icon, focused, central, color, background, onPress }: { label: string; icon: NativeIconName; focused: boolean; central: boolean; color: string; background: string; onPress: () => void }) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return <Animated.View style={[{ flex: 1, alignItems: "center" }, style]}>
    <Pressable accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: focused }} onPress={onPress} onPressIn={() => { scale.value = withSpring(0.94, { damping: 18, stiffness: 300 }); }} onPressOut={() => { scale.value = withSpring(1, { damping: 18, stiffness: 300 }); }} style={{ minWidth: 52, minHeight: 52, alignItems: "center", justifyContent: "center", gap: 2 }}>
      <View style={central ? { width: 44, height: 44, borderRadius: 22, backgroundColor: background, alignItems: "center", justifyContent: "center", shadowColor: background, shadowOpacity: focused ? .2 : .12, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 4 } : { height: 24, alignItems: "center", justifyContent: "center" }}>
        <NativeIcon name={icon} color={color} size={central ? 24 : 21} />
      </View>
      {!central ? <Text style={{ color: focused ? color : `${color}`, fontSize: 10, fontWeight: focused ? "700" : "500" }}>{label}</Text> : null}
    </Pressable>
  </Animated.View>;
}

export default function TabLayout() {
  const { colors } = useTheme();
  return <Tabs screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg }, freezeOnBlur: true }} tabBar={(props) => <NativeTabBar {...props} />}>
    <Tabs.Screen name="home" options={{ tabBarLabel: "首页" }} />
    <Tabs.Screen name="discover" options={{ tabBarLabel: "发现" }} />
    <Tabs.Screen name="publish" options={{ tabBarLabel: "发布" }} />
    <Tabs.Screen name="messages" options={{ tabBarLabel: "消息" }} />
    <Tabs.Screen name="me" options={{ tabBarLabel: "我的" }} />
  </Tabs>;
}
