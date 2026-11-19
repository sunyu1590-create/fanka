import { adminClient } from "@/lib/server/admin-client";
import { ApiError } from "@/lib/server/api";
import { readAiKey } from "@/lib/server/ai-secret";

export type AiPurpose = "review" | "summary" | "classification" | "polish" | "markdown" | "title" | "other";
export type AiMessage = { role: "system" | "user" | "assistant"; content: string };
export type AiCompletion = {
  output: string;
  model: string;
  requestId: string;
  inputTokens: number;
  outputTokens: number;
  cacheHitTokens: number | null;
  elapsedMs: number;
};

type ProviderResponse = {
  id?: string;
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; prompt_cache_hit_tokens?: number };
};

export async function modelForPurpose(purpose: AiPurpose) {
  const admin = adminClient();
  const { data, error } = await admin.from("ai_model_configs").select("model").eq("purpose", purpose).maybeSingle();
  if (error && !/ai_model_configs/i.test(error.message)) throw new ApiError(503, "AI 模型配置暂时无法读取");
  return typeof data?.model === "string" ? data.model : "deepseek-chat";
}

async function recordUsage(event: {
  requestId: string; purpose: AiPurpose; model: string; status: "success" | "failure";
  elapsedMs: number; inputTokens: number; outputTokens: number; cacheHitTokens: number | null; errorCode?: string;
  taskId?: string; taskItemId?: string;
}) {
  try {
    const admin = adminClient();
    const { data: price } = await admin.from("ai_model_prices").select("version,currency,input_per_million,cache_hit_input_per_million,output_per_million")
      .eq("model", event.model).lte("valid_from", new Date().toISOString()).order("valid_from", { ascending: false }).limit(1).maybeSingle();
    const inputPrice = Number(price?.input_per_million);
    const outputPrice = Number(price?.output_per_million);
    const cachePrice = price?.cache_hit_input_per_million == null ? null : Number(price.cache_hit_input_per_million);
    const uncachedTokens = Math.max(0, event.inputTokens - (event.cacheHitTokens || 0));
    const cachePriceAvailable = (event.cacheHitTokens || 0) === 0 || Number.isFinite(cachePrice);
    const estimatedCost = price && Number.isFinite(inputPrice) && Number.isFinite(outputPrice) && cachePriceAvailable
      ? uncachedTokens * inputPrice / 1_000_000 + (event.cacheHitTokens || 0) * (cachePrice || 0) / 1_000_000 + event.outputTokens * outputPrice / 1_000_000
      : null;
    await admin.from("ai_usage_events").insert({
      request_id: event.requestId, task_id: event.taskId || null, task_item_id: event.taskItemId || null,
      purpose: event.purpose, model: event.model, status: event.status,
      elapsed_ms: event.elapsedMs, input_tokens: event.inputTokens, output_tokens: event.outputTokens,
      output_tokens_per_second: event.elapsedMs > 0 ? event.outputTokens * 1000 / event.elapsedMs : null,
      total_tokens: event.inputTokens + event.outputTokens, cache_hit_tokens: event.cacheHitTokens,
      estimated_cost: estimatedCost, currency: estimatedCost === null ? null : price?.currency,
      price_version: estimatedCost === null ? null : price?.version, error_code: event.errorCode?.slice(0, 300) || null,
    });
  } catch {
    // AI generation must not discard a valid result because an analytics table
    // is temporarily unavailable. The server logs no prompts or secret values.
  }
}

export async function completeAiChat(input: {
  purpose: AiPurpose;
  messages: AiMessage[];
  maxTokens: number;
  temperature?: number;
  model?: string;
  jsonObject?: boolean;
  taskId?: string;
  taskItemId?: string;
}): Promise<AiCompletion> {
  const key = await readAiKey();
  if (!key) throw new ApiError(503, "AI 服务尚未配置，请联系管理员设置服务密钥");
  const model = input.model || await modelForPurpose(input.purpose);
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  let response: Response;
  try {
    const payload: Record<string, unknown> = {
      model,
      max_tokens: input.maxTokens,
      messages: input.messages,
      ...(model === "deepseek-chat" && input.temperature !== undefined ? { temperature: input.temperature } : {}),
      ...(input.jsonObject ? { response_format: { type: "json_object" } } : {}),
    };
    response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(25_000),
      cache: "no-store",
    });
  } catch (error) {
    const elapsedMs = Date.now() - startedAt;
    await recordUsage({ requestId, taskId: input.taskId, taskItemId: input.taskItemId, purpose: input.purpose, model, status: "failure", elapsedMs, inputTokens: 0, outputTokens: 0, cacheHitTokens: null, errorCode: error instanceof Error && error.name === "TimeoutError" ? "timeout" : "network_error" });
    throw new ApiError(error instanceof Error && error.name === "TimeoutError" ? 504 : 502,
      error instanceof Error && error.name === "TimeoutError" ? "AI 生成超时，请稍后重试" : "暂时无法连接 DeepSeek，请稍后重试");
  }
  const result = await response.json().catch(() => null) as ProviderResponse | null;
  const usage = result?.usage;
  const inputTokens = Math.max(0, Number(usage?.prompt_tokens) || 0);
  const outputTokens = Math.max(0, Number(usage?.completion_tokens) || 0);
  const cacheHitTokens = Number.isFinite(Number(usage?.prompt_cache_hit_tokens)) ? Math.max(0, Number(usage?.prompt_cache_hit_tokens)) : null;
  const elapsedMs = Date.now() - startedAt;
  if (!response.ok) {
    const errorCode = response.status === 429 ? "rate_limited" : response.status === 401 || response.status === 403 ? "invalid_credentials" : `provider_${response.status}`;
    await recordUsage({ requestId, taskId: input.taskId, taskItemId: input.taskItemId, purpose: input.purpose, model, status: "failure", elapsedMs, inputTokens, outputTokens, cacheHitTokens, errorCode });
    if (response.status === 429) throw new ApiError(429, "DeepSeek 请求较多，请稍后再试");
    if (response.status === 401 || response.status === 403) throw new ApiError(503, "DeepSeek 密钥无效或已过期，请联系管理员更新");
    throw new ApiError(502, "DeepSeek 暂时无法完成生成，请稍后重试");
  }
  const output = result?.choices?.[0]?.message?.content?.trim();
  if (!output) {
    await recordUsage({ requestId, taskId: input.taskId, taskItemId: input.taskItemId, purpose: input.purpose, model, status: "failure", elapsedMs, inputTokens, outputTokens, cacheHitTokens, errorCode: "empty_output" });
    throw new ApiError(502, "AI 暂时没有返回内容，请再试一次");
  }
  await recordUsage({ requestId, taskId: input.taskId, taskItemId: input.taskItemId, purpose: input.purpose, model, status: "success", elapsedMs, inputTokens, outputTokens, cacheHitTokens });
  return { output, model, requestId: result?.id || requestId, inputTokens, outputTokens, cacheHitTokens, elapsedMs };
}
