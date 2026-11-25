"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";
import { cloudRequest } from "@/lib/cloud";
import { Empty, fmtBytes, fmtNum, fmtTime, Group, Segmented } from "./admin/AdminUIKit";

type UnifiedRow = {
  id: string; at: string; kind: string; summary: string; detail: string;
  level: "info" | "warn" | "error"; ip: string | null; account: string | null; target: string | null;
  risk?: string; riskTypes?: string[]; elapsedMs?: number;
};
type Payload = {
  items: UnifiedRow[]; total: number;
  summary: { requests: number; errors: number; error_rate: number | null; slow: number; bytes: number };
  note?: string;
};

const SOURCES = [
  { value: "http", label: "访问请求" },
  { value: "admin", label: "管理员操作" },
  { value: "security", label: "安全变更" },
  { value: "ai", label: "AI 审核" },
  { value: "media", label: "媒体失败" },
  { value: "deploy", label: "部署记录" },
];

const MAX_RANGE: Record<string, Array<{ value: string; label: string }>> = {
  http: [{ value: "1h", label: "1 小时" }, { value: "24h", label: "24 小时" }, { value: "7d", label: "7 天" }],
  admin: [{ value: "24h", label: "24 小时" }, { value: "7d", label: "7 天" }, { value: "30d", label: "30 天" }],
  security: [{ value: "24h", label: "24 小时" }, { value: "7d", label: "7 天" }, { value: "30d", label: "30 天" }],
  ai: [{ value: "24h", label: "24 小时" }, { value: "7d", label: "7 天" }, { value: "30d", label: "30 天" }],
  media: [{ value: "24h", label: "24 小时" }, { value: "7d", label: "7 天" }, { value: "30d", label: "30 天" }],
  deploy: [{ value: "30d", label: "全部" }],
};

/** 统一日志：访问 / 操作 / 安全 / AI 审核 / 媒体 / 部署，来源分开查、结构统一展示。 */
export default function AdminLogs() {
  const [source, setSource] = useState("http");
  const [range, setRange] = useState("24h");
  const [status, setStatus] = useState("");
  const [ip, setIp] = useState("");
  const [q, setQ] = useState("");
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ source, range, pageSize: "60" });
      if (status) params.set("status", status);
      if (ip.trim()) params.set("ip", ip.trim());
      if (q.trim()) params.set("q", q.trim());
      const result = await cloudRequest(`/api/v1/admin/logs?${params.toString()}`);
      if (result) { setData(result as Payload); setError(""); }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "日志读取失败");
    }
  }, [source, range, status, ip, q]);
  useEffect(() => { setData(null); void load(); }, [load]);

  const isHttp = source === "http";
  return (
    <div className="cc-stack">
      <div className="ab-toolbar">
        <Segmented value={source} onChange={(value) => { setSource(value); setStatus(""); }} options={SOURCES} />
      </div>

      {isHttp ? (
        <div className="ab-stat-grid">
          <div className="ab-stat"><span>请求</span><strong>{fmtNum(data?.summary.requests)}</strong><small>当前范围</small></div>
          <div className="ab-stat"><span>错误率</span><strong>{data?.summary.error_rate == null ? "—" : `${(data.summary.error_rate * 100).toFixed(2)}%`}</strong><small>{fmtNum(data?.summary.errors)} 个 4xx/5xx</small></div>
          <div className="ab-stat"><span>慢请求</span><strong>{fmtNum(data?.summary.slow)}</strong><small>≥ 1s</small></div>
          <div className="ab-stat"><span>出站流量</span><strong>{fmtBytes(data?.summary.bytes)}</strong><small>响应体</small></div>
        </div>
      ) : null}

      <Group>
        <div className="ab-toolbar">
          <Segmented value={range} onChange={setRange} options={MAX_RANGE[source] || MAX_RANGE.http} ariaLabel="时间范围" />
          {isHttp ? (
            <Segmented value={status} onChange={setStatus} options={[{ value: "", label: "全部" }, { value: "2xx", label: "2xx" }, { value: "4xx", label: "4xx" }, { value: "5xx", label: "5xx" }]} ariaLabel="状态码" />
          ) : null}
          {source === "ai" ? (
            <Segmented value={status} onChange={setStatus} options={[{ value: "", label: "全部" }, { value: "PASS", label: "PASS" }, { value: "REVIEW", label: "REVIEW" }, { value: "REJECT", label: "REJECT" }]} ariaLabel="审核结果" />
          ) : null}
          {isHttp ? <label className="ab-search"><Search size={14} /><input value={ip} onChange={(event) => setIp(event.target.value)} placeholder="IP" aria-label="按 IP 筛选" /></label> : null}
          <label className="ab-search">
            <Search size={14} />
            <input value={q} onChange={(event) => setQ(event.target.value)} placeholder={isHttp ? "路径" : "关键词"} aria-label="关键词筛选" />
          </label>
        </div>

        {error ? <Empty title="日志不可用" hint={error} /> : !data ? <Empty title="正在读取日志" /> : !data.items.length ? <Empty title="暂无日志" hint={data.note} /> : (
          <div className="cc-tablewrap">
            <table className="cc-table">
              <thead>
                <tr><th>时间</th><th>{isHttp ? "IP" : "账号"}</th><th>事件</th><th>摘要</th><th>级别</th></tr>
              </thead>
              <tbody>
                {data.items.map((row) => (
                  <Fragment key={row.id}>
                    <tr className="cc-rowlink" onClick={() => setOpen(open === row.id ? null : row.id)}>
                      <td>{fmtTime(row.at)}</td>
                      <td className="cc-mono">{row.ip || row.account || "—"}</td>
                      <td>{row.kind}</td>
                      <td className="cc-ellipsis" title={row.summary}>{row.summary}</td>
                      <td><span className={`cc-state ${row.level === "error" ? "warn" : row.level === "warn" ? "warn" : "ok"}`}>{row.level}</span></td>
                    </tr>
                    {open === row.id ? (
                      <tr className="cc-expand">
                        <td colSpan={5}>
                          <div className="cc-expand__grid">
                            <div><strong>详情</strong><span>{row.detail || "无补充信息"}</span></div>
                            <div><strong>目标</strong><span>{row.target || "—"}</span></div>
                            {row.risk ? <div><strong>风险</strong><span>{row.risk}{row.riskTypes?.length ? ` · ${row.riskTypes.join("、")}` : ""}</span></div> : null}
                            {row.elapsedMs != null ? <div><strong>耗时</strong><span>{row.elapsedMs} ms</span></div> : null}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="cc-note">历史默认折叠、展开后加载详情；不记录密码、完整 Token、API 密钥与请求正文。原始 IP 日志保留 30 天，IP 聚合保留 180 天。</p>
      </Group>
    </div>
  );
}
