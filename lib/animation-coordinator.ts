export type AnimationPriority = "P0" | "P1" | "P2" | "P3";
export type AnimationSettlement = "completed" | "cancelled" | "timed_out" | "failed";

export type AnimationResult = {
  id: string;
  key: string;
  priority: AnimationPriority;
  state: AnimationSettlement;
  durationMs: number;
};

type ActiveAnimation = {
  id: string;
  key: string;
  priority: AnimationPriority;
  animation: Animation;
  startedAt: number;
  timeout: number;
  settled: boolean;
  onFinish: () => void;
  onCancel: () => void;
  onSettled: (result: AnimationResult) => void;
};

export type CoordinatedAnimation = {
  id: string;
  cancel: () => void;
  fail: () => void;
  release: () => void;
};

function transactionId() {
  return globalThis.crypto?.randomUUID?.() ?? `animation-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

class AnimationCoordinator {
  private readonly active = new Map<string, ActiveAnimation>();

  track(
    key: string,
    priority: AnimationPriority,
    animation: Animation,
    onSettled: (result: AnimationResult) => void,
    timeoutMs: number,
  ): CoordinatedAnimation {
    const previous = this.active.get(key);
    if (previous) this.settle(previous, "cancelled", true);

    const entry = {} as ActiveAnimation;
    Object.assign(entry, {
      id: transactionId(),
      key,
      priority,
      animation,
      startedAt: performance.now(),
      timeout: 0,
      settled: false,
      onSettled,
      onFinish: () => this.settle(entry, "completed", false),
      onCancel: () => this.settle(entry, "cancelled", false),
    });
    this.active.set(key, entry);
    animation.addEventListener("finish", entry.onFinish, { once: true });
    animation.addEventListener("cancel", entry.onCancel, { once: true });
    entry.timeout = window.setTimeout(() => this.settle(entry, "timed_out", true), timeoutMs);

    return {
      id: entry.id,
      cancel: () => this.settle(entry, "cancelled", true),
      fail: () => this.settle(entry, "failed", true),
      release: () => this.release(entry),
    };
  }

  cancelAll() {
    for (const entry of [...this.active.values()]) this.settle(entry, "cancelled", true);
  }

  private settle(entry: ActiveAnimation, state: AnimationSettlement, cancelAnimation: boolean) {
    if (entry.settled) return;
    entry.settled = true;
    if (this.active.get(entry.key) === entry) this.active.delete(entry.key);
    window.clearTimeout(entry.timeout);
    entry.animation.removeEventListener("finish", entry.onFinish);
    entry.animation.removeEventListener("cancel", entry.onCancel);
    if (cancelAnimation) entry.animation.cancel();
    entry.onSettled({
      id: entry.id,
      key: entry.key,
      priority: entry.priority,
      state,
      durationMs: Math.max(0, performance.now() - entry.startedAt),
    });
  }

  private release(entry: ActiveAnimation) {
    if (entry.settled) return;
    entry.settled = true;
    if (this.active.get(entry.key) === entry) this.active.delete(entry.key);
    window.clearTimeout(entry.timeout);
    entry.animation.removeEventListener("finish", entry.onFinish);
    entry.animation.removeEventListener("cancel", entry.onCancel);
    entry.animation.cancel();
  }
}

export const animationCoordinator = new AnimationCoordinator();
