/**
 * 运营成本估算。
 *
 * 只做两件事：
 * 1. 用管理员配置的计费单价 × 真实用量，得到「估算费用」（不是账单）；
 * 2. 与真实记录对比区分：服务器月费是管理员填的固定成本，流量/存储/AI 是按单价估算。
 * 没有配置单价时一律返回 null，不编造金额。
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { dayKey } from "./realtime";

const GB = 1024 ** 3;

export type CostSettings = {
  currency: string;
  server_monthly: number;
  storage_per_gb_month: number;
  egress_per_gb: number;
  ai_input_per_million: number;
  ai_output_per_million: number;
  egress_free_gb: number;
  storage_free_gb: number;
  ai_free_amount: number;
  budget_monthly: number;
  budget_egress_gb: number;
  budget_storage_gb: number;
  budget_ai: number;
  updated_at: string | null;
};

export type CostReport = {
  currency: string;
  month: { from: string; to: string; label: string };
  configured: boolean;
  server: { monthly: number; period: string };
  storage: { bytes: number; billableGb: number; estimate: number | null; freeGb: number };
  egress: { bytes: number; billableGb: number; estimate: number | null; freeGb: number; note: string };
  ai: { inputTokens: number; outputTokens: number; requests: number; estimate: number | null; freeAmount: number; note: string };
  totals: { estimate: number | null; monthToDate: number | null };
  budgets: Array<{ key: string; label: string; used: number; limit: number; unit: string; ratio: number | null }>;
  settings: CostSettings;
  note: string;
};

function monthRange(today = dayKey()) {
  const from = `${today.slice(0, 7)}-01`;
  return { from, to: today, label: `${today.slice(0, 7)}` };
}

export async function costReport(db: SupabaseClient): Promise<CostReport> {
  const { data: settingsRow, error } = await db.from("admin_cost_settings").select("*").eq("id", 1).maybeSingle();
  if (error) throw new Error("成本配置读取失败");
  const settings: CostSettings = {
    currency: settingsRow?.currency || "CNY",
    server_monthly: Number(settingsRow?.server_monthly || 0),
    storage_per_gb_month: Number(settingsRow?.storage_per_gb_month || 0),
    egress_per_gb: Number(settingsRow?.egress_per_gb || 0),
    ai_input_per_million: Number(settingsRow?.ai_input_per_million || 0),
    ai_output_per_million: Number(settingsRow?.ai_output_per_million || 0),
    egress_free_gb: Number(settingsRow?.egress_free_gb || 0),
    storage_free_gb: Number(settingsRow?.storage_free_gb || 0),
    ai_free_amount: Number(settingsRow?.ai_free_amount || 0),
    budget_monthly: Number(settingsRow?.budget_monthly || 0),
    budget_egress_gb: Number(settingsRow?.budget_egress_gb || 0),
    budget_storage_gb: Number(settingsRow?.budget_storage_gb || 0),
    budget_ai: Number(settingsRow?.budget_ai || 0),
    updated_at: settingsRow?.updated_at || null,
  };
  const month = monthRange();
  const monthStart = new Date(`${month.from}T00:00:00+08:00`).toISOString();

  const [storage, traffic, aiItems] = await Promise.all([
    db.rpc("heika_storage_summary"),
    db.from("media_traffic_daily").select("kind,bytes").gte("day", month.from).lte("day", month.to),
    db.from("ai_task_items").select("input_tokens,output_tokens,status").gte("created_at", monthStart).limit(20_000),
  ]);

  const storageBytes = Number(storage.data?.bytes || 0);
  const storageBillableGb = Math.max(0, storageBytes / GB - settings.storage_free_gb);
  const storageEstimate = settings.storage_per_gb_month > 0 ? storageBillableGb * settings.storage_per_gb_month : null;

  const egressKinds = new Set(["image", "video", "attachment", "apk"]);
  const egressBytes = (traffic.data || []).filter((row) => egressKinds.has(String(row.kind))).reduce((sum, row) => sum + Number(row.bytes || 0), 0);
  const egressBillableGb = Math.max(0, egressBytes / GB - settings.egress_free_gb);
  const egressEstimate = settings.egress_per_gb > 0 ? egressBillableGb * settings.egress_per_gb : null;

  const tokens = (aiItems.data || []).reduce((acc, row) => {
    acc.input += Number(row.input_tokens || 0);
    acc.output += Number(row.output_tokens || 0);
    acc.requests += 1;
    return acc;
  }, { input: 0, output: 0, requests: 0 });
  const aiRaw = (tokens.input / 1_000_000) * settings.ai_input_per_million + (tokens.output / 1_000_000) * settings.ai_output_per_million;
  const aiEstimate = settings.ai_input_per_million > 0 || settings.ai_output_per_million > 0 ? Math.max(0, aiRaw - settings.ai_free_amount) : null;

  const configured = settings.server_monthly > 0 || settings.storage_per_gb_month > 0 || settings.egress_per_gb > 0 || settings.ai_input_per_million > 0;
  const monthToDate = configured ? settings.server_monthly + (storageEstimate || 0) + (egressEstimate || 0) + (aiEstimate || 0) : null;

  const budgets = [
    { key: "monthly", label: "月度运营成本", used: monthToDate || 0, limit: settings.budget_monthly, unit: settings.currency, ratio: settings.budget_monthly > 0 && monthToDate != null ? monthToDate / settings.budget_monthly : null },
    { key: "egress", label: "本月下行流量", used: egressBytes / GB, limit: settings.budget_egress_gb, unit: "GB", ratio: settings.budget_egress_gb > 0 ? egressBytes / GB / settings.budget_egress_gb : null },
    { key: "storage", label: "当前存储容量", used: storageBytes / GB, limit: settings.budget_storage_gb, unit: "GB", ratio: settings.budget_storage_gb > 0 ? storageBytes / GB / settings.budget_storage_gb : null },
    { key: "ai", label: "本月 AI 费用", used: aiEstimate || 0, limit: settings.budget_ai, unit: settings.currency, ratio: settings.budget_ai > 0 && aiEstimate != null ? aiEstimate / settings.budget_ai : null },
  ];

  return {
    currency: settings.currency,
    month,
    configured,
    server: { monthly: settings.server_monthly, period: "按月（管理员配置的固定成本）" },
    storage: { bytes: storageBytes, billableGb: Number(storageBillableGb.toFixed(3)), estimate: storageEstimate == null ? null : Number(storageEstimate.toFixed(2)), freeGb: settings.storage_free_gb },
    egress: { bytes: egressBytes, billableGb: Number(egressBillableGb.toFixed(3)), estimate: egressEstimate == null ? null : Number(egressEstimate.toFixed(2)), freeGb: settings.egress_free_gb, note: "按反向代理记录的媒体响应字节 ÷ 1024³ 估算，不含页面与静态资源" },
    ai: { inputTokens: tokens.input, outputTokens: tokens.output, requests: tokens.requests, estimate: aiEstimate == null ? null : Number(aiEstimate.toFixed(2)), freeAmount: settings.ai_free_amount, note: "按本月 ai_task_items 的真实 Token 用量与单价估算，不含未落库的模型调用" },
    totals: { estimate: monthToDate == null ? null : Number(monthToDate.toFixed(2)), monthToDate: monthToDate == null ? null : Number(monthToDate.toFixed(2)) },
    budgets,
    settings,
    note: configured
      ? "费用为估算值：服务器为管理员配置的月费，存储/流量/AI 按配置单价 × 真实用量计算，不是云厂商账单。"
      : "尚未配置计费单价，因此不显示任何金额。填写单价后才会计算估算费用。",
  };
}
