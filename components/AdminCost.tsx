"use client";

/** 运营成本：按管理员配置的单价 × 真实用量估算，与云厂商账单严格区分。 */

import { useCallback, useEffect, useState } from "react";
import { cloudRequest } from "@/lib/cloud";
import { Collapse, Empty, fmtBytes, fmtNum } from "./admin/AdminUIKit";

type Report = {
  currency: string;
  month: { from: string; to: string; label: string };
  configured: boolean;
  server: { monthly: number; period: string };
  storage: { bytes: number; billableGb: number; estimate: number | null; freeGb: number };
  egress: { bytes: number; billableGb: number; estimate: number | null; freeGb: number; note: string };
  ai: { inputTokens: number; outputTokens: number; requests: number; estimate: number | null; freeAmount: number; note: string };
  totals: { estimate: number | null };
  budgets: Array<{ key: string; label: string; used: number; limit: number; unit: string; ratio: number | null }>;
  settings: Settings;
  note: string;
};

type Settings = {
  currency: string; server_monthly: number; storage_per_gb_month: number; egress_per_gb: number;
  ai_input_per_million: number; ai_output_per_million: number;
  egress_free_gb: number; storage_free_gb: number; ai_free_amount: number;
  budget_monthly: number; budget_egress_gb: number; budget_storage_gb: number; budget_ai: number;
};

const FIELDS: Array<{ key: keyof Settings; label: string; hint: string; step?: string }> = [
  { key: "server_monthly", label: "服务器月费", hint: "固定成本（元/月）" },
  { key: "storage_per_gb_month", label: "存储单价", hint: "元 / GB / 月", step: "0.0001" },
  { key: "egress_per_gb", label: "流量单价", hint: "元 / GB 下行", step: "0.0001" },
  { key: "ai_input_per_million", label: "输入 Token 单价", hint: "元 / 百万 Token", step: "0.0001" },
  { key: "ai_output_per_million", label: "输出 Token 单价", hint: "元 / 百万 Token", step: "0.0001" },
  { key: "egress_free_gb", label: "流量免费额度", hint: "GB / 月" },
  { key: "storage_free_gb", label: "存储免费额度", hint: "GB" },
  { key: "ai_free_amount", label: "AI 免费额度", hint: "元 / 月" },
  { key: "budget_monthly", label: "月度成本预算", hint: "元，超出只告警" },
  { key: "budget_egress_gb", label: "月流量预算", hint: "GB，超出只告警" },
  { key: "budget_storage_gb", label: "存储预算", hint: "GB，超出只告警" },
  { key: "budget_ai", label: "AI 费用预算", hint: "元，超出只告警" },
];

export default function AdminCost() {
  const [report, setReport] = useState<Report | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await cloudRequest("/api/v1/admin/cost") as Report;
      setReport(result);
      setSettings({
        currency: result.settings.currency,
        server_monthly: Number(result.settings.server_monthly || 0),
        storage_per_gb_month: Number(result.settings.storage_per_gb_month || 0),
        egress_per_gb: Number(result.settings.egress_per_gb || 0),
        ai_input_per_million: Number(result.settings.ai_input_per_million || 0),
        ai_output_per_million: Number(result.settings.ai_output_per_million || 0),
        egress_free_gb: Number(result.settings.egress_free_gb || 0),
        storage_free_gb: Number(result.settings.storage_free_gb || 0),
        ai_free_amount: Number(result.settings.ai_free_amount || 0),
        budget_monthly: Number(result.settings.budget_monthly || 0),
        budget_egress_gb: Number(result.settings.budget_egress_gb || 0),
        budget_storage_gb: Number(result.settings.budget_storage_gb || 0),
        budget_ai: Number(result.settings.budget_ai || 0),
      });
      setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "成本数据读取失败"); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!settings) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await cloudRequest("/api/v1/admin/cost", settings, "PATCH");
      setNotice("计费配置已保存，金额会按新单价重新估算。");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "保存失败"); }
    finally { setBusy(false); }
  };

  const money = (value: number | null) => value == null ? "—" : `${report?.currency === "USD" ? "$" : "¥"}${value.toFixed(2)}`;

  return (
    <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
      {error ? <p className="ab-sub" style={{ color: "var(--ab-coral)" }}>{error}</p> : null}
      {notice ? <p className="ab-sub" style={{ color: "var(--ab-emerald)" }}>{notice}</p> : null}

      <div className="ab-card tone-amber">
        <div className="ab-card__head"><span className="ab-card__title">本月估算</span><span className="ab-card__badge">{report?.month.label || "—"}</span></div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
          <b style={{ fontSize: 32, fontWeight: 720, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums" }}>{money(report?.totals.estimate ?? null)}</b>
          <span className="ab-label">{report?.configured ? "按配置单价估算" : "尚未配置单价"}</span>
        </div>
        <p className="ab-label" style={{ margin: 0 }}>{report?.note}</p>
      </div>

      <div className="ab-bento">
        {[
          // 服务器月费未配置时不能显示 ¥0.00，否则会被读成「服务器免费」。
          { label: "服务器", value: report?.server.monthly && report.server.monthly > 0 ? report.server.monthly : null, meta: report?.server.period || "未配置月费", tone: "gold" },
          { label: "存储（当前）", value: report?.storage.estimate ?? null, meta: `${fmtBytes(report?.storage.bytes)} · 计费 ${report?.storage.billableGb ?? 0} GB`, tone: "blue" },
          { label: "本月下行流量", value: report?.egress.estimate ?? null, meta: `${fmtBytes(report?.egress.bytes)} · 计费 ${report?.egress.billableGb ?? 0} GB`, tone: "emerald" },
          { label: "本月 AI", value: report?.ai.estimate ?? null, meta: `${fmtNum((report?.ai.inputTokens || 0) + (report?.ai.outputTokens || 0))} Token · ${fmtNum(report?.ai.requests)} 次`, tone: "violet" },
        ].map((card) => (
          <div key={card.label} className={`ab-card ab-c2 ab-m6 tone-${card.tone}`} style={{ gap: 3 }}>
            <span className="ab-label">{card.label}</span>
            <b style={{ fontSize: 22, fontWeight: 680, fontVariantNumeric: "tabular-nums" }}>{card.value == null ? "—" : money(Number(card.value))}</b>
            <span className="ab-label">{card.meta}</span>
          </div>
        ))}
      </div>

      <div className="ab-card">
        <div className="ab-card__head"><span className="ab-card__title">预算</span><span className="ab-card__badge">超出只产生告警</span></div>
        {report?.budgets.filter((budget) => budget.limit > 0).length ? report.budgets.filter((budget) => budget.limit > 0).map((budget) => {
          const ratio = Math.max(0, Math.min(1.4, budget.ratio || 0));
          const tone = ratio >= 1 ? "coral" : ratio >= 0.8 ? "amber" : "emerald";
          return (
            <div key={budget.key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5 }}>
                <span>{budget.label}</span>
                <span className="ab-label">{budget.unit === "GB" ? `${budget.used.toFixed(2)} / ${budget.limit} GB` : `${money(budget.used)} / ${money(budget.limit)}`}</span>
              </div>
              <div className={`ab-progress tone-${tone}`}><i style={{ width: `${Math.min(100, ratio * 100)}%` }} /></div>
            </div>
          );
        }) : <Empty title="尚未设置预算" hint="在下方计费配置里填写预算后，超出会自动进入告警中心。" />}
        <p className="ab-label" style={{ margin: 0 }}>预算只触发告警，不会自动关闭业务、限制下载或停止审核。</p>
      </div>

      <Collapse title="计费配置" hint="单价与预算" count={12}>
        {settings ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, padding: 10 }}>
            <label className="ab-label" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              币种
              <select className="ab-select" value={settings.currency} onChange={(event) => setSettings({ ...settings, currency: event.target.value })}>
                <option value="CNY">人民币 CNY</option>
                <option value="USD">美元 USD</option>
                <option value="HKD">港币 HKD</option>
              </select>
            </label>
            {FIELDS.map((field) => (
              <label key={field.key} className="ab-label" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {field.label}
                <input
                  className="ab-select"
                  type="number"
                  min={0}
                  step={field.step || "0.01"}
                  value={settings[field.key] as number}
                  onChange={(event) => setSettings({ ...settings, [field.key]: Number(event.target.value) })}
                  aria-label={field.label}
                />
                <span style={{ fontSize: 9.5 }}>{field.hint}</span>
              </label>
            ))}
            <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 10 }}>
              <button type="button" className="ab-chip info" style={{ border: 0, padding: "8px 12px" }} disabled={busy} onClick={() => void save()}>{busy ? "保存中…" : "保存配置"}</button>
              <span className="ab-label">保存后立即生效；单价为空或 0 时不计入估算。</span>
            </div>
          </div>
        ) : null}
      </Collapse>

      <p className="ab-label" style={{ padding: "0 4px", lineHeight: 1.7 }}>{report?.egress.note} {report?.ai.note} 未接入云厂商账单接口，页面只显示估算值；实际账单以腾讯云与模型服务商结算为准。</p>
    </div>
  );
}
