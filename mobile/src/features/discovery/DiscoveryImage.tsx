import React, { useEffect, useState } from "react";
import { ActivityIndicator, View, type StyleProp, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import { useTheme } from "../../lib/theme";
import { getFeedImageSource } from "./DiscoveryRepository";

export function DiscoveryImage({ uri, label, recyclingKey, retryKey, style, onError }: {
  uri?: string;
  label: string;
  recyclingKey: string;
  retryKey: number;
  style: StyleProp<ViewStyle>;
  onError: () => void;
}) {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(Boolean(uri));
  const [failed, setFailed] = useState(false);
  const source = getFeedImageSource(uri);

  useEffect(() => {
    setLoading(Boolean(source));
    setFailed(false);
  }, [recyclingKey, retryKey, source]);

  if (!source) return <View accessibilityRole="image" accessibilityLabel={`${label}，无图片`} style={[{ backgroundColor: colors.raised }, style]} />;

  return <View style={[{ backgroundColor: colors.raised, overflow: "hidden" }, style]}>
    <Image
      key={`${recyclingKey}:${retryKey}`}
      source={{ uri: source }}
      alt={label}
      accessibilityLabel={label}
      contentFit="cover"
      cachePolicy="memory-disk"
      recyclingKey={`${recyclingKey}:${retryKey}`}
      transition={200}
      onLoadStart={() => { setFailed(false); setLoading(true); }}
      onLoad={() => setLoading(false)}
      onError={() => { setLoading(false); setFailed(true); onError(); }}
      style={{ width: "100%", height: "100%" }}
    />
    {loading && !failed ? <View pointerEvents="none" style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center", backgroundColor: `${colors.raised}35` }}><ActivityIndicator size="small" color={colors.action} /></View> : null}
  </View>;
}
