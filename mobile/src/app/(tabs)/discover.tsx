import React, { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, useIsFocused } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../lib/theme";
import { useMobileSession } from "../../lib/mobile-api";
import { DiscoveryFeedModule } from "../../features/discovery/DiscoveryFeedModule";
import type { DiscoveryChannel } from "../../features/discovery/DiscoveryRepository";

const CHANNEL_KEY = "heika:preferences:discovery:channel:v1";

export default function DiscoverScreen() {
  const { colors } = useTheme();
  const { session, loading: authLoading } = useMobileSession();
  const isFocused = useIsFocused();
  const [channel, setChannel] = useState<DiscoveryChannel>("community");
  const [channelReady, setChannelReady] = useState(false);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(CHANNEL_KEY)
      .then((value) => { if (active && (value === "community" || value === "ai")) setChannel(value); })
      .catch(() => undefined)
      .finally(() => { if (active) setChannelReady(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (channelReady) void AsyncStorage.setItem(CHANNEL_KEY, channel).catch(() => undefined);
  }, [channel, channelReady]);

  return <SafeAreaView edges={["top", "left", "right"]} style={{ flex: 1, backgroundColor: colors.bg }}>
    <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.line }}>
      <View style={{ minHeight: 43, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View>
          <Text style={{ color: colors.subtle, fontSize: 9, fontWeight: "800", letterSpacing: 1.6 }}>HEIKA / DISCOVER</Text>
          <Text style={{ color: colors.ink, fontSize: 24, fontWeight: "700", marginTop: 2 }}>发现</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="搜索内容和用户" onPress={() => router.push("/search")} style={{ width: 42, height: 42, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.line, borderRadius: 15, backgroundColor: colors.bg }}>
          <Text style={{ color: colors.ink, fontSize: 21, lineHeight: 25 }}>⌕</Text>
        </Pressable>
      </View>
      <View accessibilityRole="tablist" style={{ flexDirection: "row", marginTop: 9, padding: 3, borderWidth: 1, borderColor: colors.line, borderRadius: 17, backgroundColor: colors.raised }}>
        <ChannelButton label="社区" selected={channel === "community"} onPress={() => setChannel("community")} />
        <ChannelButton label="AI 空间" selected={channel === "ai"} onPress={() => setChannel("ai")} />
      </View>
    </View>
    <View style={{ flex: 1 }}>
      <DiscoveryFeedModule channel="community" active={isFocused && channelReady && channel === "community"} authLoading={authLoading} session={session} />
      <DiscoveryFeedModule channel="ai" active={isFocused && channelReady && channel === "ai"} authLoading={authLoading} session={session} />
    </View>
  </SafeAreaView>;
}

function ChannelButton({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { colors, isDark } = useTheme();
  return <Pressable accessibilityRole="tab" accessibilityState={{ selected }} onPress={onPress} style={{ flex: 1, minHeight: 34, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: selected ? colors.surface : "transparent", borderWidth: selected ? 1 : 0, borderColor: colors.line }}>
    <Text style={{ color: selected ? (isDark ? colors.ink : colors.action) : colors.muted, fontSize: 12, fontWeight: selected ? "700" : "500" }}>{label}</Text>
  </Pressable>;
}
