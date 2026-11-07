import React, { useEffect, useRef } from "react";
import { router, Stack, usePathname } from "expo-router";
import * as Notifications from "expo-notifications";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AppState } from "react-native";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getDb, MobileSessionProvider, useMobileSession } from "../lib/mobile-api";
import { ThemeProvider, useTheme } from "../lib/theme";
import { NavigationPreferencesProvider } from "../lib/navigation-preferences";
import { NativeBlurProvider } from "../lib/native-blur";
import { prepareNativeNotifications, showIncomingMessageNotification } from "../lib/native-notifications";

function RootStack() {
  const { colors, isDark } = useTheme();
  // Keep route transitions opacity-only. The launch screen runs on a broad range of
  // Android HWUI implementations where nested transform transitions can overflow RenderThread.
  return <><StatusBar style={isDark ? "light" : "dark"} /><NativeNotificationBridge /><Stack screenOptions={{ headerShown: false, animation: "fade", contentStyle: { backgroundColor: colors.bg }, gestureEnabled: true, fullScreenGestureEnabled: true }} /></>;
}

function NativeNotificationBridge() {
  const { session } = useMobileSession();
  const userId = session?.user.id;
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  const handledResponse = useRef("");
  const seenMessageIds = useRef(new Set<string>());

  useEffect(() => { pathnameRef.current = pathname; }, [pathname]);

  useEffect(() => {
    void prepareNativeNotifications().catch(() => undefined);
    const openNotification = (response: Notifications.NotificationResponse | null) => {
      const request = response?.notification.request;
      if (!request || handledResponse.current === request.identifier) return;
      handledResponse.current = request.identifier;
      const data = request.content.data as { kind?: unknown; conversationId?: unknown };
      if (data.kind === "message" && typeof data.conversationId === "string" && /^[0-9a-f-]{36}$/i.test(data.conversationId)) {
        router.push({ pathname: "/chat/[id]", params: { id: data.conversationId } } as never);
      } else {
        router.push("/notifications");
      }
    };
    openNotification(Notifications.getLastNotificationResponse());
    const responseSubscription = Notifications.addNotificationResponseReceivedListener(openNotification);
    return () => responseSubscription.remove();
  }, []);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    let channel: ReturnType<SupabaseClient["channel"]> | undefined;
    void getDb().then((client) => {
      if (!active) return;
      channel = client.channel(`heika-native-notifications-${userId}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "dm_messages" }, (payload) => {
          const message = payload.new as { id?: string; conversation_id?: string; sender_id?: string };
          if (!message.id || !message.conversation_id || message.sender_id === userId) return;
          if (seenMessageIds.current.has(message.id)) return;
          seenMessageIds.current.add(message.id);
          if (seenMessageIds.current.size > 256) seenMessageIds.current.delete(seenMessageIds.current.values().next().value!);
          if (AppState.currentState !== "active" || pathnameRef.current === `/chat/${message.conversation_id}`) return;
          void showIncomingMessageNotification(message.conversation_id).catch(() => undefined);
        })
        .subscribe();
    }).catch(() => undefined);
    return () => {
      active = false;
      if (channel) void getDb().then((client) => client.removeChannel(channel!));
    };
  }, [userId]);

  return null;
}

export default function RootLayout() {
  return <GestureHandlerRootView style={{ flex: 1 }}><SafeAreaProvider><NativeBlurProvider><ThemeProvider><NavigationPreferencesProvider><MobileSessionProvider><RootStack /></MobileSessionProvider></NavigationPreferencesProvider></ThemeProvider></NativeBlurProvider></SafeAreaProvider></GestureHandlerRootView>;
}
