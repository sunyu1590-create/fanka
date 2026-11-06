import React, { useEffect, useState } from "react";
import { Text, View, type ImageProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useTheme } from "../lib/theme";
import { API_BASE } from "../lib/mobile-api";

type Props = Omit<ImageProps, "source" | "onError" | "onLoad"> & {
  uri?: string | null;
  label?: string;
  fallbackStyle?: StyleProp<ViewStyle>;
};

export function NativeImage({ uri, label = "图片", style, fallbackStyle, ...props }: Props) {
  const { colors } = useTheme();
  const resolvedUri = resolveNativeImageUri(uri);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const opacity = useSharedValue(0);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  useEffect(() => {
    setFailed(false); setLoaded(false); opacity.value = 0;
  }, [opacity, resolvedUri]);
  if (!resolvedUri || failed) {
    return <View accessibilityRole="image" accessibilityLabel="当前图片未加载" style={[{ minHeight: 120, backgroundColor: colors.raised, alignItems: "center", justifyContent: "center", padding: 16, overflow: "hidden" }, style as StyleProp<ViewStyle>, fallbackStyle]}>
      <View style={{ position: "absolute", width: 54, height: 54, borderWidth: 1, borderColor: `${colors.action}35`, transform: [{ rotate: "45deg" }] }} />
      <Text style={{ color: colors.action, fontSize: 9, fontWeight: "800", letterSpacing: 1.8 }}>HEIKA / MEDIA</Text>
      <Text style={{ color: colors.ink, fontSize: 12, fontWeight: "600", marginTop: 9 }}>当前图片未加载</Text>
      <Text style={{ color: colors.subtle, fontSize: 10, marginTop: 4 }} numberOfLines={1}>{label}</Text>
    </View>;
  }
  return <View style={[{ overflow: "hidden", backgroundColor: colors.raised }, style as StyleProp<ViewStyle>] as StyleProp<ViewStyle>}>
    <Animated.Image {...props} source={{ uri: resolvedUri }} alt={label} onError={() => setFailed(true)} onLoad={() => { setLoaded(true); opacity.value = withTiming(1, { duration: 260 }); }} blurRadius={loaded ? 0 : 8} style={[style, { width: "100%", height: "100%" }, fadeStyle]} />
  </View>;
}

export function resolveNativeImageUri(uri?: string | null) {
  if (!uri?.trim()) return null;
  const value = uri.trim();
  try {
    const parsed = new URL(value, API_BASE);
    if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && __DEV__)) return null;
    return parsed.toString();
  } catch { return null; }
}
