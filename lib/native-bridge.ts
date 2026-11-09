export type NativePermissionResult = {
  granted: boolean;
  enabled: boolean;
  permission?: "default" | "granted" | "denied";
};

export type NativeTransitionRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type NativeMessage = {
  version: 1;
  id: string;
  type: string;
  requestType?: string;
  event?: string;
  ok?: boolean;
  data?: Record<string, unknown>;
  payload?: Record<string, unknown>;
};

type NativeMessageObject = {
  postMessage(message: string): void;
  onmessage: ((event: MessageEvent<string>) => void) | null;
};

declare global {
  interface Window {
    HeikaNative?: NativeMessageObject;
  }
}

type NativeEventHandler = (payload: Record<string, unknown>) => boolean | void;
type PendingRequest = {
  requestType: string;
  resolve: (message: NativeMessage) => void;
  reject: (error: Error) => void;
  timeout: number;
};

const pendingRequests = new Map<string, PendingRequest>();
const handlers = new Map<string, Set<NativeEventHandler>>();
let requestCounter = 0;
let imageErrorCount = 0;

function newId() {
  requestCounter += 1;
  const random = globalThis.crypto?.randomUUID?.();
  return random || `web-${Date.now().toString(36)}-${requestCounter.toString(36)}`;
}

function post(type: string, payload: Record<string, unknown> = {}) {
  const bridge = typeof window === "undefined" ? undefined : window.HeikaNative;
  if (!bridge) return false;
  try {
    bridge.postMessage(JSON.stringify({ version: 1, id: newId(), type, payload }));
    return true;
  } catch {
    return false;
  }
}

function notifyHandlers(name: string, payload: Record<string, unknown>) {
  for (const handler of handlers.get(name) ?? []) {
    try {
      if (handler(payload) === true) return true;
    } catch {
      // A web event handler must not break delivery to other subscribers.
    }
  }
  return false;
}

function onNativeMessage(event: MessageEvent<string>) {
  let message: NativeMessage;
  try {
    message = JSON.parse(event.data) as NativeMessage;
  } catch {
    return;
  }
  if (message.version !== 1 || typeof message.id !== "string") return;

  if (message.type === "result") {
    const pending = pendingRequests.get(message.id);
    if (!pending || pending.requestType !== message.requestType) return;
    window.clearTimeout(pending.timeout);
    pendingRequests.delete(message.id);
    pending.resolve(message);
    return;
  }
  if (message.type !== "event" || typeof message.event !== "string") return;

  const payload = message.payload ?? {};
  if (message.event === "system.back") {
    const requestId = typeof payload.requestId === "string" ? payload.requestId : "";
    const consumed = notifyHandlers("system.back", payload);
    post("system.back.result", { requestId, consumed });
    return;
  }
  if (message.event === "navigation.open") {
    const requestId = typeof payload.requestId === "string" ? payload.requestId : "";
    const accepted = notifyHandlers("navigation.open", payload);
    post("navigation.ack", { requestId, accepted });
    return;
  }
  notifyHandlers(message.event, payload);
}

export function hasNativeBridge() {
  return typeof window !== "undefined" && typeof window.HeikaNative?.postMessage === "function";
}

export function installNativeBridge() {
  if (!hasNativeBridge()) return () => {};
  const bridge = window.HeikaNative!;
  document.documentElement.dataset.heikaNative = "true";
  bridge.onmessage = onNativeMessage;

  const onImageError = (event: Event) => {
    if (!(event.target instanceof HTMLImageElement) || imageErrorCount >= 30) return;
    imageErrorCount += 1;
    post("image.error");
  };
  window.addEventListener("error", onImageError, true);

  void request("capabilities.get").catch(() => undefined);
  return () => {
    window.removeEventListener("error", onImageError, true);
    if (bridge.onmessage === onNativeMessage) bridge.onmessage = null;
    if (document.documentElement.dataset.heikaNative === "true") {
      delete document.documentElement.dataset.heikaNative;
    }
    for (const [id, pending] of pendingRequests) {
      window.clearTimeout(pending.timeout);
      pending.reject(new Error("原生通信已关闭"));
      pendingRequests.delete(id);
    }
  };
}

export function announceNativeReady() {
  if (!hasNativeBridge()) return;
  post("bridge.ready");
  const current = new URL(window.location.href);
  const postId = current.searchParams.get("post");
  const conversationId = current.searchParams.get("conversation");
  const path = postId && /^[0-9]{1,20}$/.test(postId) && Number.isSafeInteger(Number(postId))
    ? `/?post=${postId}`
    : conversationId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(conversationId)
      ? `/?conversation=${conversationId.toLowerCase()}`
      : "/";
  post("page.state", { path });
}

export function syncNativeDiscoverySession(userId: string | null, accessToken: string | null) {
  if (!hasNativeBridge()) return false;
  const validUserId = userId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)
    ? userId
    : null;
  const validToken = accessToken && accessToken.length <= 4_096 && /^[A-Za-z0-9_=-]+\.[A-Za-z0-9_=-]+\.[A-Za-z0-9_=-]*$/.test(accessToken)
    ? accessToken
    : null;
  return post("discovery.auth", { userId: validUserId, accessToken: validToken });
}

export function syncNativeDiscoveryPersonalization(data: {
  userId: string | null;
  interests: string[];
  viewedIds: number[];
  personalRatings: Record<number, number>;
}) {
  if (!hasNativeBridge()) return false;
  const interests = data.interests.map((value) => value.trim().slice(0, 40)).filter(Boolean).slice(0, 24);
  const viewedIds = data.viewedIds.filter((value) => Number.isSafeInteger(value) && value > 0).slice(-200);
  const personalRatings = Object.fromEntries(Object.entries(data.personalRatings)
    .map(([id, value]) => [Number(id), value] as const)
    .filter(([id, value]) => Number.isSafeInteger(id) && id > 0 && Number.isInteger(value) && value >= 1 && value <= 5)
    .slice(-200));
  return post("discovery.personalization", {
    userId: data.userId,
    interests,
    viewedIds,
    personalRatings,
  });
}

export function setNativeDiscoveryVisibility(
  visible: boolean,
  navigationTopCss: number,
  theme: "light" | "dark",
  composeLeftCss = 0,
  composeTopCss = 0,
  composeWidthCss = 0,
  composeHeightCss = 0,
) {
  if (!hasNativeBridge() || !Number.isFinite(navigationTopCss)) return false;
  return post("discovery.visibility", {
    visible,
    navigationTopCss: Math.min(10_000, Math.max(0, navigationTopCss)),
    theme,
    composeLeftCss: Number.isFinite(composeLeftCss) ? composeLeftCss : 0,
    composeTopCss: Number.isFinite(composeTopCss) ? composeTopCss : 0,
    composeWidthCss: Number.isFinite(composeWidthCss) ? composeWidthCss : 0,
    composeHeightCss: Number.isFinite(composeHeightCss) ? composeHeightCss : 0,
  });
}

export function reportNativePageState(path: string) {
  if (hasNativeBridge()) post("page.state", { path });
}

export function subscribeNativeEvent(name: string, handler: NativeEventHandler) {
  const set = handlers.get(name) ?? new Set<NativeEventHandler>();
  set.add(handler);
  handlers.set(name, set);
  return () => {
    set.delete(handler);
    if (set.size === 0) handlers.delete(name);
  };
}

export async function requestNativeNotificationPermission(): Promise<NativePermissionResult | null> {
  if (!hasNativeBridge()) return null;
  const response = await request("notifications.requestPermission");
  if (!response.ok) throw new Error("原生通知权限请求失败");
  return {
    granted: response.data?.granted === true,
    enabled: response.data?.enabled === true,
    permission: normalizeNotificationPermission(response.data?.permission),
  };
}

export async function getNativeNotificationStatus(): Promise<NativePermissionResult | null> {
  if (!hasNativeBridge()) return null;
  const response = await request("notifications.status");
  if (!response.ok) throw new Error("无法读取 Android 通知权限状态");
  return {
    granted: response.data?.granted === true,
    enabled: response.data?.enabled === true,
    permission: normalizeNotificationPermission(response.data?.permission),
  };
}

export async function openNativeNotificationSettings(): Promise<boolean> {
  if (!hasNativeBridge()) return false;
  try {
    const response = await request("notifications.openSettings");
    return response.ok === true && response.data?.opened === true;
  } catch {
    return false;
  }
}

export async function shareViaNative(data: { title: string; text: string; url: string }): Promise<boolean> {
  if (!hasNativeBridge()) return false;
  try {
    const response = await request("system.share", {
      title: data.title.slice(0, 120),
      text: data.text.slice(0, 2_000),
      url: data.url,
    });
    return response.ok === true && response.data?.shared === true;
  } catch {
    return false;
  }
}

export async function openNativeAbout(): Promise<boolean> {
  if (!hasNativeBridge()) return false;
  try {
    const response = await request("app.about.open");
    return response.ok === true && response.data?.opened === true;
  } catch { return false; }
}

export async function prepareNativeCardTransition(
  transactionId: string,
  rect: NativeTransitionRect,
  devicePixelRatio: number,
): Promise<boolean> {
  if (!hasNativeBridge() || !isTransitionRect(rect) || !Number.isFinite(devicePixelRatio) || devicePixelRatio < 0.5 || devicePixelRatio > 4) return false;
  try {
    const response = await request("card.transition.prepare", { transactionId, rect, devicePixelRatio }, 600);
    return response.ok === true && response.data?.prepared === true;
  } catch {
    return false;
  }
}

export async function startNativeCardTransition(
  transactionId: string,
  direction: "open" | "close",
  targetRect: NativeTransitionRect,
  durationMs: number,
): Promise<boolean> {
  if (!hasNativeBridge() || !isTransitionRect(targetRect) || !Number.isFinite(durationMs)) return false;
  try {
    const response = await request("card.transition.start", {
      transactionId,
      direction,
      targetRect,
      durationMs: Math.min(600, Math.max(160, Math.round(durationMs))),
    }, 500);
    return response.ok === true && response.data?.accepted === true;
  } catch {
    return false;
  }
}

export async function cancelNativeCardTransition(transactionId: string) {
  if (!hasNativeBridge()) return;
  try {
    await request("card.transition.cancel", { transactionId }, 300);
  } catch {
    // The Activity also releases transition resources on pause and page teardown.
  }
}

export async function releaseNativeCardTransition(transactionId: string) {
  if (!hasNativeBridge()) return;
  try {
    await request("card.transition.release", { transactionId }, 300);
  } catch {
    // Releasing an already expired snapshot is harmless.
  }
}

export function waitForNativeCardTransition(transactionId: string, timeoutMs: number) {
  return new Promise<boolean>((resolve) => {
    let settled = false;
    let timeout = 0;
    const finish = (completed: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      unsubscribe();
      resolve(completed);
    };
    const unsubscribe = subscribeNativeEvent("card.transition.finished", (payload) => {
      if (payload.transactionId !== transactionId) return;
      finish(payload.completed === true);
    });
    timeout = window.setTimeout(() => finish(false), Math.max(100, timeoutMs));
  });
}

function request(type: string, payload: Record<string, unknown> = {}, timeoutMs = 8_000): Promise<NativeMessage> {
  const bridge = typeof window === "undefined" ? undefined : window.HeikaNative;
  if (!bridge) return Promise.reject(new Error("原生通信不可用"));
  const id = newId();
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error("原生通信超时"));
    }, timeoutMs);
    pendingRequests.set(id, { requestType: type, resolve, reject, timeout });
    try {
      bridge.postMessage(JSON.stringify({ version: 1, id, type, payload }));
    } catch {
      window.clearTimeout(timeout);
      pendingRequests.delete(id);
      reject(new Error("原生通信失败"));
    }
  });
}

function isTransitionRect(rect: NativeTransitionRect) {
  return [rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) &&
    rect.width > 0 && rect.height > 0 && rect.width <= 2_000 && rect.height <= 2_000 &&
    Math.abs(rect.left) <= 10_000 && Math.abs(rect.top) <= 10_000;
}

function normalizeNotificationPermission(value: unknown): NativePermissionResult["permission"] {
  return value === "default" || value === "granted" || value === "denied" ? value : undefined;
}
