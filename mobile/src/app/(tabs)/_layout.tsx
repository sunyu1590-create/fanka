import React from "react";
import { Tabs } from "expo-router";
import type { BottomTabBarProps } from "expo-router/build/layouts/Tabs";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useTheme } from "../../lib/theme";

const items: Record<string, { label: string; icon: string }> = {
  home: { label: "首页", icon: "⌂" },
  discover: { label: "发现", icon: "◉" },
  publish: { label: "发布", icon: "+" },
  messages: { label: "消息", icon: "▱" },
  me: { label: "我的", icon: "◯" },
};

function NativeTabBar({ state, descriptors, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  return <Animated.View entering={FadeIn.duration(180)} style={{ position: "absolute", left: 12, right: 12, bottom: Math.max(insets.bottom, 8), minHeight: 64, flexDirection: "row", alignItems: "center", justifyContent: "space-around", paddingHorizontal: 5, paddingVertical: 6, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 22, shadowColor: "#000000", shadowOpacity: 0.11, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 10 }}>
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

function TabButton({ label, icon, focused, central, color, background, onPress }: { label: string; icon: string; focused: boolean; central: boolean; color: string; background: string; onPress: () => void }) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return <Animated.View style={[{ flex: 1, alignItems: "center" }, style]}>
    <Pressable accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: focused }} onPress={onPress} onPressIn={() => { scale.value = withSpring(0.94, { damping: 18, stiffness: 300 }); }} onPressOut={() => { scale.value = withSpring(1, { damping: 18, stiffness: 300 }); }} style={{ minWidth: 52, minHeight: 52, alignItems: "center", justifyContent: "center", gap: 2 }}>
      <View style={central ? { width: 42, height: 42, borderRadius: 21, backgroundColor: background, alignItems: "center", justifyContent: "center" } : undefined}>
        <Text style={{ color, fontSize: central ? 28 : 23, lineHeight: central ? 36 : 27, fontWeight: central || focused ? "700" : "400" }}>{icon}</Text>
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
