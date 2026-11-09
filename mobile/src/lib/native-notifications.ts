import * as Notifications from "expo-notifications";
import { AndroidImportance } from "expo-notifications";
import { Platform } from "react-native";

export const MESSAGE_CHANNEL_ID = "heika-community";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function prepareNativeNotifications() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(MESSAGE_CHANNEL_ID, {
    name: "私信与动态",
    description: "黑卡的新私信和社区动态提醒",
    importance: AndroidImportance.HIGH,
    vibrationPattern: [0, 180, 120, 180],
    lightColor: "#49665F",
    enableVibrate: true,
    enableLights: true,
    showBadge: true,
  });
}

export async function getNativeNotificationPermission() {
  const permission = await Notifications.getPermissionsAsync();
  return { granted: permission.granted, canAskAgain: permission.canAskAgain };
}

export async function requestNativeNotificationPermission() {
  await prepareNativeNotifications();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted || !current.canAskAgain) return current;
  return Notifications.requestPermissionsAsync();
}

export async function showIncomingMessageNotification(conversationId: string) {
  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) return false;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "收到新私信",
      body: "打开黑卡查看消息",
      data: { kind: "message", conversationId },
      sound: false,
      color: "#49665F",
      threadIdentifier: `heika-message-${conversationId}`,
    },
    trigger: null,
  });
  return true;
}
