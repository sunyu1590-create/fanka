import React, { useEffect, useState } from "react";
import { Text, View, type ImageProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useTheme } from "../lib/theme";

type Props = Omit<ImageProps, "source" | "onError" | "onLoad"> & {
  uri?: string | null;
  label?: string;
  fallbackStyle?: StyleProp<ViewStyle>;
};

export function NativeImage({ uri, label = "图片", style, fallbackStyle, ...props }: Props) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const opacity = useSharedValue(0);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  useEffect(() => {
    setFailed(false); setLoaded(false); opacity.value = 0;
  }, [opacity, uri]);
  if (!uri || failed) {
    return <View accessibilityRole="image" accessibilityLabel="当前图片未加载" style={[{ minHeight: 120, backgroundColor: colors.raised, alignItems: "center", justifyContent: "center", padding: 16 }, style as StyleProp<ViewStyle>, fallbackStyle]}>
      <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "600" }}>当前图片未加载</Text>
      <Text style={{ color: colors.subtle, fontSize: 10, marginTop: 4 }} numberOfLines={1}>{label}</Text>
    </View>;
  }
  return <View style={[{ overflow: "hidden", backgroundColor: colors.raised }, style as StyleProp<ViewStyle>] as StyleProp<ViewStyle>}>
    <Animated.Image {...props} source={{ uri }} alt={label} onError={() => setFailed(true)} onLoad={() => { setLoaded(true); opacity.value = withTiming(1, { duration: 220 }); }} blurRadius={loaded ? 0 : 8} style={[style, { width: "100%", height: "100%" }, fadeStyle]} />
  </View>;
}
