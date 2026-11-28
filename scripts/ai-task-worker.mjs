const endpoint = process.env.AI_TASK_WORKER_URL || "http://app:3000/api/v1/internal/ai-tasks/process";
const token = process.env.AI_TASK_WORKER_TOKEN || "";
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 启动竞态：app 容器可能晚于 worker 就绪，此前固定 8s 重试会在启动阶段刷屏。
// 改为连续失败指数退避（2s → 4s → 8s → 16s → 30s 封顶），成功一次即重置常规节奏。
const MIN_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 30_000;
let consecutiveFailures = 0;

function nextBackoffMs() {
  const exponential = MIN_BACKOFF_MS * Math.pow(2, consecutiveFailures);
  return Math.min(exponential, MAX_BACKOFF_MS);
}

while (true) {
  if (token.length < 32) {
    console.error("[ai-worker] AI_TASK_WORKER_TOKEN must contain at least 32 characters");
    await wait(30_000);
    continue;
  }
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(70_000),
      cache: "no-store",
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      consecutiveFailures += 1;
      const delay = nextBackoffMs();
      console.error(`[ai-worker] request failed (${response.status}), retry in ${delay}ms`);
      await wait(delay);
      continue;
    }
    consecutiveFailures = 0;
    await wait(result?.data?.processed ? 250 : 2_500);
  } catch (error) {
    consecutiveFailures += 1;
    const delay = nextBackoffMs();
    const reason = error instanceof Error ? error.name : "unknown";
    console.error(`[ai-worker] request failed (${reason}), retry in ${delay}ms`);
    await wait(delay);
  }
}
