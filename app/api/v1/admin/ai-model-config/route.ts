import { NextRequest } from "next/server";
import { ApiError, jsonBody, respond } from "@/lib/server/api";
import { adminClient } from "@/lib/server/admin-client";
import { readAiKey } from "@/lib/server/ai-secret";
import { requireAdmin } from "@/lib/server/require-admin";

export const runtime = "nodejs";
const purposes = new Set(["review", "summary", "classification", "polish", "markdown", "title", "other"]);
type ModelsResponse = { data?: Array<{ id?: string }> };

async function providerModels() {
  const key = await readAiKey();
  if (!key) return { available: false, models: [] as string[] };
  try {
    const response = await fetch("https://api.deepseek.com/models", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(5000), cache: "no-store",
    });
    if (!response.ok) return { available: false, models: [] as string[] };
    const result = await response.json() as ModelsResponse;
    const models = [...new Set((result.data || []).map((model) => model.id).filter((id): id is string => typeof id === "string" && /^[a-zA-Z0-9._:-]{1,80}$/.test(id)))];
    return { available: models.length > 0, models };
  } catch {
    return { available: false, models: [] as string[] };
  }
}

// 价格下拉必须覆盖“真正在用的模型”。DeepSeek /models 偶尔不再返回仍在服务的
// 模型（例如 deepseek-chat），只按该列表生成选项会让管理员无法给实际模型定价。
async function priceModels(admin: ReturnType<typeof adminClient>, provider: string[]) {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [usage, configs, prices] = await Promise.all([
    admin.from("ai_usage_events").select("model").gte("created_at", since).limit(5000),
    admin.from("ai_model_configs").select("model"),
    admin.from("ai_model_prices").select("model"),
  ]);
  const counts = new Map<string, number>();
  for (const row of usage.data || []) {
    const model = typeof row.model === "string" ? row.model.trim() : "";
    if (model) counts.set(model, (counts.get(model) || 0) + 1);
  }
  const usageModels = [...counts.entries()].map(([model, requests]) => ({ model, requests })).sort((a, b) => b.requests - a.requests);
  const models = [...new Set([
    ...provider,
    ...usageModels.map((row) => row.model),
    ...(configs.data || []).map((row) => row.model).filter((model): model is string => typeof model === "string" && Boolean(model)),
    ...(prices.data || []).map((row) => row.model).filter((model): model is string => typeof model === "string" && Boolean(model)),
  ])];
  return { models, usageModels };
}

export async function GET(req: NextRequest) {
  return respond(async () => {
    await requireAdmin(req);
    const admin = adminClient();
    const [configs, history, prices, provider] = await Promise.all([
      admin.from("ai_model_configs").select("purpose,model,updated_at,updated_by").order("purpose"),
      admin.from("ai_model_config_history").select("purpose,model,changed_at,profiles!ai_model_config_history_changed_by_fkey(nickname)").order("changed_at", { ascending: false }).limit(40),
      admin.from("ai_model_prices").select("model,version,currency,input_per_million,cache_hit_input_per_million,output_per_million,valid_from,updated_at").order("valid_from", { ascending: false }).limit(40),
      providerModels(),
    ]);
    if (configs.error || history.error || prices.error) throw new ApiError(503, "AI 模型配置暂不可用，请确认数据库迁移已应用");
    const priceable = await priceModels(admin, provider.models);
    return {
      configs: configs.data || [], history: history.data || [], prices: prices.data || [],
      availableModels: provider.models, models: priceable.models, usageModels: priceable.usageModels,
      discoveryAvailable: provider.available,
    };
  });
}

export async function PATCH(req: NextRequest) {
  return respond(async () => {
    const { user } = await requireAdmin(req);
    const body = await jsonBody(req);
    const admin = adminClient();
    const provider = await providerModels();
    if (!provider.available) throw new ApiError(503, "暂时无法从 DeepSeek 读取可用模型；请检查密钥和服务连接");

    if (body.action === "model") {
      const purpose = typeof body.purpose === "string" ? body.purpose : "";
      const model = typeof body.model === "string" ? body.model : "";
      if (!purposes.has(purpose) || !provider.models.includes(model)) throw new ApiError(400, "任务类型或模型无效；模型必须来自 DeepSeek 当前返回的可用列表");
      const saved = await admin.from("ai_model_configs").upsert({ purpose, model, updated_by: user.id, updated_at: new Date().toISOString() }, { onConflict: "purpose" }).select("purpose,model,updated_at").single();
      if (saved.error) throw new ApiError(503, "AI 模型配置保存失败");
      await admin.from("ai_model_config_history").insert({ purpose, model, changed_by: user.id });
      await admin.from("moderation_audit_logs").insert({ actor_id: user.id, action: "ai_model_config_updated", target_type: "ai_model", target_id: purpose, reason: `切换为 ${model}` });
      return saved.data;
    }

    if (body.action === "price") {
      const model = typeof body.model === "string" ? body.model : "";
      const version = typeof body.version === "string" ? body.version.trim().slice(0, 60) : "";
      const currency = body.currency === "CNY" || body.currency === "USD" ? body.currency : null;
      const inputPrice = Number(body.inputPerMillion);
      const outputPrice = Number(body.outputPerMillion);
      const cacheRaw = body.cacheHitInputPerMillion;
      const cachePrice = cacheRaw === "" || cacheRaw === null || cacheRaw === undefined ? null : Number(cacheRaw);
      const priceable = await priceModels(admin, provider.models);
      if (!priceable.models.includes(model) || !version || !currency || !Number.isFinite(inputPrice) || inputPrice < 0 || !Number.isFinite(outputPrice) || outputPrice < 0 || (cachePrice !== null && (!Number.isFinite(cachePrice) || cachePrice < 0))) {
        throw new ApiError(400, "价格配置无效，请填写当前模型的价格版本、币种及每百万 Token 价格");
      }
      const validFrom = typeof body.validFrom === "string" && Number.isFinite(Date.parse(body.validFrom)) ? new Date(body.validFrom).toISOString() : new Date().toISOString();
      const saved = await admin.from("ai_model_prices").upsert({
        model, version, currency, input_per_million: inputPrice, cache_hit_input_per_million: cachePrice, output_per_million: outputPrice,
        valid_from: validFrom, updated_by: user.id, updated_at: new Date().toISOString(),
      }, { onConflict: "model,version" }).select().single();
      if (saved.error) throw new ApiError(503, "价格版本保存失败");

      // 历史请求在登记价格前写入，费用为空；登记后立即按该价格回填，
      // 否则用量卡片会一直显示“缺少完整价格配置”。
      const { data: unpriced } = await admin.from("ai_usage_events")
        .select("id,input_tokens,output_tokens,cache_hit_tokens")
        .eq("model", model).is("estimated_cost", null).limit(2000);
      const cacheHit = (row: { cache_hit_tokens: number | null }) => Math.max(0, Number(row.cache_hit_tokens) || 0);
      const rows = (unpriced || []).filter((row) => cacheHit(row) === 0 || cachePrice !== null).map((row) => {
        const cached = cacheHit(row);
        const uncached = Math.max(0, (Number(row.input_tokens) || 0) - cached);
        return {
          id: row.id,
          estimated_cost: uncached * inputPrice / 1_000_000 + cached * (cachePrice || 0) / 1_000_000 + (Number(row.output_tokens) || 0) * outputPrice / 1_000_000,
        };
      });
      for (let index = 0; index < rows.length; index += 100) {
        await Promise.all(rows.slice(index, index + 100).map((row) => admin.from("ai_usage_events")
          .update({ estimated_cost: row.estimated_cost, currency, price_version: version }).eq("id", row.id)));
      }

      await admin.from("moderation_audit_logs").insert({ actor_id: user.id, action: "ai_model_price_updated", target_type: "ai_model", target_id: model, reason: `价格版本 ${version}（${currency}）` });
      return { ...saved.data, backfilled: rows.length };
    }
    throw new ApiError(400, "配置操作无效");
  });
}
