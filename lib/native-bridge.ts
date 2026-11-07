export type NativePermissionResult = {
  granted: boolean;
  enabled: boolean;
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
  };
}

function request(type: string, payload: Record<string, unknown> = {}): Promise<NativeMessage> {
  const bridge = typeof window === "undefined" ? undefined : window.HeikaNative;
  if (!bridge) return Promise.reject(new Error("原生通信不可用"));
  const id = newId();
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error("原生通信超时"));
    }, 8_000);
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
