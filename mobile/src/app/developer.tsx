import React from "react";
import { Text, View } from "react-native";
import { PageFrame } from "../components/MobileUi";
import { useTheme } from "../lib/theme";

export default function DeveloperScreen() {
  const { colors } = useTheme();
  return <PageFrame title="关于开发者" eyebrow="INDEPENDENTLY MADE / HEIKA">
    <View style={{ gap: 14, paddingTop: 7 }}>
      <Text style={{ color: colors.ink, fontSize: 19, lineHeight: 27, fontWeight: "600" }}>一张卡片，打开一个新的发现。</Text>
      <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 21 }}>黑卡由独立开发者创作与维护。从翻开卡片，到阅读、分享和交流，产品会在真实使用和反馈中持续完善。</Text>
      <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 21 }}>感谢你愿意花时间探索，也欢迎通过意见反馈告诉我哪里还可以做得更好。</Text>
    </View>
  </PageFrame>;
}
