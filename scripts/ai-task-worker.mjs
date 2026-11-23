const endpoint = process.env.AI_TASK_WORKER_URL || "http://app:3000/api/v1/internal/ai-tasks/process";
const token = process.env.AI_TASK_WORKER_TOKEN || "";
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
      console.error(`[ai-worker] request failed (${response.status})`);
      await wait(8_000);
      continue;
    }
    await wait(result?.data?.processed ? 250 : 2_500);
  } catch (error) {
    console.error(`[ai-worker] request failed (${error instanceof Error ? error.name : "unknown"})`);
    await wait(8_000);
  }
}
