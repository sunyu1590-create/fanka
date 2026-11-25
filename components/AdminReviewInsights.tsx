"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, RotateCcw } from "lucide-react";
import { cloudRequest } from "@/lib/cloud";
import { confirmInApp } from "@/lib/in-app-dialog";
import { Empty, fmtNum, fmtTime, Group, Segmented } from "./admin/AdminUIKit";

type Totals = { total: number; pass: number; review: number; reject: number; pass_rate: number | null; review_rate: number | null; reject_rate: number | null; human_reviewed: number; human_overridden: number; override_rate: number | null; avg_ms: number; tokens: number; input_tokens: number; output_tokens: number };
type Risk = { risk: string; count: number };
type Policy = { id: number; version: string; name: string; active: boolean; created_at: string; activated_at: string | null; system_prompt?: string };
type Decision = { id: number; decision: string; risk_level: string; risk_types: string[]; reason: string; policy_version: string; model: string | null; elapsed_ms: number; human_decision: string | null; created_at: string };
type Stats = { totals: Totals; risk_types: Risk[]; policies: Array<{ version: string; count: number; pass: number }>; recent: Decision[]; note?: string };

const RISK_LABEL: Record<string, string> = {
  extremism: "极端主义", political_violation: "涉政违规", commercial_spam: "商业广告", malicious_redirect: "恶意引流",
  fraud: "诈骗", violent_threat: "暴力威胁", malware: "恶意软件", serious_illegal: "严重违法", privacy_violation: "侵犯隐私",
};

export default function AdminReviewInsights({ view, onNotice }: { view: "review-stats" | "review-policy"; onNotice: (text: string) => void }) {
  const [range, setRange] = useState<"1d" | "7d" | "30d">("7d");
  const [stats, setStats] = useState<Stats | null>(null);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [statsResult, policyResult] = await Promise.all([
        cloudRequest(`/api/v1/admin/review-stats?range=${range}`),
        cloudRequest("/api/v1/admin/review-policies"),
      ]);
      if (statsResult) setStats(statsResult as Stats);
      if (policyResult) setPolicies((policyResult as { policies: Policy[] }).policies || []);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "审核统计读取失败");
    }
  }, [range]);
  useEffect(() => { void load(); }, [load]);

  const activate = async (policy: Policy) => {
    const ok = await confirmInApp(`切换到策略 ${policy.version}「${policy.name}」，之后的新审核立即使用该提示词。`, { title: "切换审核策略", confirmLabel: "启用" });
    if (!ok) return;
    try {
      await cloudRequest("/api/v1/admin/review-policies", { action: "activate", version: policy.version, reason: "管理后台切换" });
      onNotice(`已启用策略 ${policy.version}`);
      await load();
    } catch (cause) {
      onNotice(cause instanceof Error ? cause.message : "切换失败");
    }
  };

  if (error) return <Group><Empty title="审核数据不可用" hint={error} /></Group>;

  if (view === "review-policy") {
    return (
      <div className="cc-stack">
        <Group>
          <div className="ab-card__head" style={{ marginBottom: 8 }}><span className="ab-card__title">策略版本</span><span className="ab-card__badge">回滚 = 启用历史版本</span></div>
          {!policies.length ? <Empty title="尚未读取到策略" hint="请确认控制中心迁移已执行" /> : (
            <div className="cc-tablewrap">
              <table className="cc-table">
                <thead><tr><th>版本</th><th>名称</th><th>状态</th><th>启用时间</th><th>创建时间</th><th /></tr></thead>
                <tbody>
                  {policies.map((policy) => (
                    <tr key={policy.id}>
                      <td>{policy.version}</td>
                      <td>{policy.name}</td>
                      <td>{policy.active ? <span className="cc-state ok">生效中</span> : <span className="cc-state">历史</span>}</td>
                      <td>{policy.activated_at ? fmtTime(policy.activated_at) : "—"}</td>
                      <td>{fmtTime(policy.created_at)}</td>
                      <td>{policy.active ? <CheckCircle2 size={15} /> : <button type="button" className="cc-btn" onClick={() => void activate(policy)}><RotateCcw size={13} />启用</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="cc-note">提示词、阈值与结果映射都在服务端生效；切换版本不影响已发布作品与人工复审队列。</p>
        </Group>
      </div>
    );
  }

  if (!stats) return <Group><Empty title="正在汇总审核记录" /></Group>;
  const totals = stats.totals;

  return (
    <div className="cc-stack">
      <div className="ab-toolbar">
        <Segmented value={range} onChange={setRange} options={[{ value: "1d", label: "今天" }, { value: "7d", label: "近 7 天" }, { value: "30d", label: "近 30 天" }]} />
        <span className="cc-note" style={{ margin: 0 }}>{totals.total ? `${fmtNum(totals.total)} 次审核` : "暂无审核记录"}</span>
      </div>

      <div className="ab-stat-grid">
        <div className="ab-stat"><span>自动通过率</span><strong>{totals.pass_rate == null ? "—" : `${(totals.pass_rate * 100).toFixed(1)}%`}</strong><small>{fmtNum(totals.pass)} 件</small></div>
        <div className="ab-stat"><span>人工复审率</span><strong>{totals.review_rate == null ? "—" : `${(totals.review_rate * 100).toFixed(1)}%`}</strong><small>{fmtNum(totals.review)} 件</small></div>
        <div className="ab-stat"><span>明确驳回</span><strong>{totals.reject_rate == null ? "—" : `${(totals.reject_rate * 100).toFixed(1)}%`}</strong><small>{fmtNum(totals.reject)} 件</small></div>
        <div className="ab-stat"><span>人工推翻 AI</span><strong>{totals.override_rate == null ? "—" : `${(totals.override_rate * 100).toFixed(1)}%`}</strong><small>{fmtNum(totals.human_overridden)} / {fmtNum(totals.human_reviewed)}</small></div>
        <div className="ab-stat"><span>平均耗时</span><strong>{totals.avg_ms ? `${totals.avg_ms} ms` : "—"}</strong><small>单次审核</small></div>
        <div className="ab-stat"><span>Token</span><strong>{fmtNum(totals.tokens)}</strong><small>输入 {fmtNum(totals.input_tokens)} / 输出 {fmtNum(totals.output_tokens)}</small></div>
      </div>

      <Group>
        <div className="ab-card__head" style={{ marginBottom: 8 }}><span className="ab-card__title">违规类型分布</span><span className="ab-card__badge">仅明确违规</span></div>
        {!stats.risk_types.length ? <p className="cc-muted">该范围内没有命中违规类型</p> : (
          <div className="cc-bars">
            {stats.risk_types.map((item) => {
              const max = Math.max(...stats.risk_types.map((risk) => risk.count));
              return (
                <div key={item.risk} className="cc-bars__row">
                  <span>{RISK_LABEL[item.risk] || item.risk}</span>
                  <i><b style={{ width: `${Math.max(3, (item.count / max) * 100)}%` }} /></i>
                  <em>{fmtNum(item.count)}</em>
                </div>
              );
            })}
          </div>
        )}
      </Group>

      <Group>
        <div className="ab-card__head" style={{ marginBottom: 8 }}><span className="ab-card__title">最近审核决定</span></div>
        {!stats.recent.length ? <p className="cc-muted">暂无记录</p> : (
          <div className="cc-tablewrap">
            <table className="cc-table">
              <thead><tr><th>结论</th><th>风险</th><th>原因</th><th>策略</th><th>耗时</th><th>人工</th><th>时间</th></tr></thead>
              <tbody>
                {stats.recent.map((row) => (
                  <tr key={row.id}>
                    <td><span className={`cc-state ${row.decision === "PASS" ? "ok" : "warn"}`}>{row.decision}</span></td>
                    <td>{row.risk_types.map((risk) => RISK_LABEL[risk] || risk).join("、") || "—"}</td>
                    <td style={{ maxWidth: 300 }}>{row.reason}</td>
                    <td>{row.policy_version}</td>
                    <td>{row.elapsed_ms} ms</td>
                    <td>{row.human_decision || "未处理"}</td>
                    <td>{fmtTime(row.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="cc-note">{stats.note || "统计只反映已发生的审核，不按目标通过率倒推。"}</p>
      </Group>
    </div>
  );
}
