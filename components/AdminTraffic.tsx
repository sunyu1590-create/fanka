"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { cloudRequest } from "@/lib/cloud";
import { Empty, fmtBytes, fmtNum, fmtTime, Group, Segmented } from "./admin/AdminUIKit";

type Point = { day: string; requests: number; bytesOut: number; errors: number; nicRx: number; nicTx: number };
type KindRow = { kind: string; label: string; requests: number; bytes: number; failed: number; share: number };
type ResourceRow = { path: string; kind: string; label: string; requests: number; bytes: number; downloads: number };
type EndpointRow = { path: string; requests: number; bytes: number; errors: number; avgMs: number; p95Ms: number };
type IpRow = { ip: string; requests: number; bytesIn: number; bytesOut: number; errors: number; avgMs: number; lastSeen: string; client: string | null; errorRate: number };
type AccountRow = { accountId: string; nickname: string | null; tasks: number; ready: number; fileBytes: number; sentBytes: number };

type Payload = {
  range: { key: string; label: string; from: string; to: string; days: number };
  overview: {
    app: { requests: number; bytesOut: number; bytesIn: number; errors: number; errorRate: number; avgMs: number; uniqueIps: number; p95Ms: number };
    nic: { rx: number; tx: number; total: number; sampledDays: number; nonHttpTx: number };
  };
  series: Point[];
  kinds: KindRow[];
  ips: IpRow[];
  resources: ResourceRow[];
  endpoints: EndpointRow[];
  accounts: AccountRow[];
  coverage: { ipDays: string; accountNote: string; nicNote: string };
};

const RANGES = [
  { value: "today", label: "今天" },
  { value: "yesterday", label: "昨天" },
  { value: "7d", label: "近 7 天" },
  { value: "30d", label: "近 30 天" },
];

/** 接口与流量分析：网络层 / 应用层 / 存储层三种口径分列，全部取自真实采集。 */
export default function AdminTraffic() {
  const [range, setRange] = useState("today");
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"resource" | "endpoint" | "ip" | "account">("resource");
  const [sort, setSort] = useState<"bytes" | "requests">("bytes");

  const load = useCallback(async () => {
    try {
      const result = await cloudRequest(`/api/v1/admin/traffic?range=${range}&limit=30`);
      if (result) { setData(result as Payload); setError(""); }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "流量数据读取失败");
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { setLoading(true); void load(); }, [load]);

  if (loading) return <Group><Empty title="正在汇总流量" hint="数据来自边缘访问日志与网卡计数" /></Group>;
  if (error) return <Group><Empty title="流量数据不可用" hint={error} /></Group>;
  if (!data) return <Group><Empty title="暂无流量数据" hint="采集器写入后这里会自动出现" /></Group>;

  const { overview, series, kinds } = data;
  const maxDay = Math.max(1, ...series.map((point) => Math.max(point.nicTx, point.bytesOut)));
  const sortRows = <T extends { bytes: number; requests: number }>(rows: T[]) =>
    [...rows].sort((a, b) => (sort === "bytes" ? b.bytes - a.bytes : b.requests - a.requests)).slice(0, 30);

  return (
    <div className="cc-stack">
      <div className="ab-toolbar">
        <Segmented value={range} onChange={setRange} options={RANGES} />
        <span className="cc-muted">{data.range.from} 至 {data.range.to} · {data.range.days} 天</span>
        <button type="button" className="ab-iconbtn" onClick={() => void load()} aria-label="刷新"><RefreshCw size={15} /></button>
      </div>

      <div className="ab-stat-grid">
        <Stat label="应用层请求" value={fmtNum(overview.app.requests)} hint={`${fmtNum(overview.app.uniqueIps)} 个独立 IP`} />
        <Stat label="应用层响应字节" value={fmtBytes(overview.app.bytesOut)} hint={`平均 ${overview.app.avgMs}ms · P95 ${overview.app.p95Ms}ms`} tone="ok" />
        <Stat label="网络层出网" value={fmtBytes(overview.nic.tx)} hint={`非 HTTP ${fmtBytes(overview.nic.nonHttpTx)}`} />
        <Stat label="错误率" value={`${overview.app.errorRate}%`} hint={`${fmtNum(overview.app.errors)} 次 4xx/5xx`} tone={overview.app.errorRate > 3 ? "warn" : undefined} />
      </div>

      <Group>
        <div className="ab-card__head" style={{ marginBottom: 10 }}>
          <span className="ab-card__title">每日流量</span>
          <span className="ab-card__badge">橙：应用层响应 · 蓝：网卡出网</span>
        </div>
        {series.length ? (
          <div className="cc-bars">
            {series.map((point) => (
              <div key={point.day} className="cc-bars__row">
                <span>{point.day.slice(5)}</span>
                <i className="cc-bars__dual">
                  <b style={{ width: `${Math.max(2, (point.bytesOut / maxDay) * 100)}%` }} />
                  <u style={{ width: `${Math.max(2, (point.nicTx / maxDay) * 100)}%` }} />
                </i>
                <em>{fmtBytes(point.nicTx)}</em>
              </div>
            ))}
          </div>
        ) : <p className="cc-muted">当前范围没有采集到流量</p>}
        <p className="cc-note">{data.coverage.nicNote}</p>
      </Group>

      <Group>
        <div className="ab-card__head" style={{ marginBottom: 10 }}>
          <span className="ab-card__title">按资源类型</span>
          <span className="ab-card__badge">合计 {fmtBytes(kinds.reduce((sum, row) => sum + row.bytes, 0))}</span>
        </div>
        <div className="cc-tablewrap">
          <table className="cc-table">
            <thead><tr><th>类型</th><th>请求</th><th>流量</th><th>失败</th><th>占比</th></tr></thead>
            <tbody>
              {kinds.map((row) => (
                <tr key={row.kind}>
                  <td>{row.label}</td>
                  <td>{fmtNum(row.requests)}</td>
                  <td>{fmtBytes(row.bytes)}</td>
                  <td>{fmtNum(row.failed)}</td>
                  <td>
                    <span className="cc-share"><i style={{ width: `${Math.max(1, row.share)}%` }} /></span>
                    <small>{row.share}%</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Group>

      <Group>
        <div className="ab-toolbar">
          <Segmented
            value={tab}
            onChange={(value) => setTab(value as typeof tab)}
            options={[{ value: "resource", label: "资源" }, { value: "endpoint", label: "接口" }, { value: "ip", label: "IP" }, { value: "account", label: "账号" }]}
          />
          <Segmented
            value={sort}
            onChange={(value) => setSort(value as typeof sort)}
            options={[{ value: "bytes", label: "按流量" }, { value: "requests", label: "按请求数" }]}
            ariaLabel="排序依据"
          />
        </div>

        {tab === "resource" ? (
          <div className="cc-tablewrap">
            <table className="cc-table">
              <thead><tr><th>资源路径</th><th>类型</th><th>请求</th><th>流量</th><th>下载</th></tr></thead>
              <tbody>
                {sortRows(data.resources).map((row) => (
                  <tr key={row.path}>
                    <td className="cc-mono cc-ellipsis" title={row.path}>{row.path}</td>
                    <td>{row.label}</td>
                    <td>{fmtNum(row.requests)}</td>
                    <td>{fmtBytes(row.bytes)}</td>
                    <td>{fmtNum(row.downloads)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.resources.length ? <p className="cc-muted" style={{ padding: 16 }}>当前范围没有资源访问记录</p> : null}
          </div>
        ) : null}

        {tab === "endpoint" ? (
          <div className="cc-tablewrap">
            <table className="cc-table">
              <thead><tr><th>接口</th><th>请求</th><th>响应字节</th><th>错误</th><th>平均</th><th>P95</th></tr></thead>
              <tbody>
                {sortRows(data.endpoints).map((row) => (
                  <tr key={row.path}>
                    <td className="cc-mono cc-ellipsis" title={row.path}>{row.path}</td>
                    <td>{fmtNum(row.requests)}</td>
                    <td>{fmtBytes(row.bytes)}</td>
                    <td>{fmtNum(row.errors)}</td>
                    <td>{row.avgMs}ms</td>
                    <td>{row.p95Ms}ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.endpoints.length ? <p className="cc-muted" style={{ padding: 16 }}>当前范围没有接口明细</p> : null}
            <p className="cc-note">接口明细取自业务请求摘要，不含 Cookie、Token 与正文；静态资源已排除。</p>
          </div>
        ) : null}

        {tab === "ip" ? (
          <div className="cc-tablewrap">
            <table className="cc-table">
              <thead><tr><th>IP</th><th>请求</th><th>下行字节</th><th>上行字节</th><th>错误</th><th>平均</th><th>最近</th></tr></thead>
              <tbody>
                {[...data.ips].sort((a, b) => (sort === "bytes" ? b.bytesOut - a.bytesOut : b.requests - a.requests)).map((row) => (
                  <tr key={row.ip}>
                    <td className="cc-mono">{row.ip}{row.client ? <small> {row.client}</small> : null}</td>
                    <td>{fmtNum(row.requests)}</td>
                    <td>{fmtBytes(row.bytesOut)}</td>
                    <td>{fmtBytes(row.bytesIn)}</td>
                    <td>{fmtNum(row.errors)}</td>
                    <td>{row.avgMs}ms</td>
                    <td>{row.lastSeen ? fmtTime(row.lastSeen) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.ips.length ? <p className="cc-muted" style={{ padding: 16 }}>当前范围没有 IP 访问记录</p> : null}
            <p className="cc-note">{data.coverage.ipDays}</p>
          </div>
        ) : null}

        {tab === "account" ? (
          <div className="cc-tablewrap">
            <table className="cc-table">
              <thead><tr><th>账号</th><th>上传任务</th><th>成功</th><th>文件字节</th><th>实际发送</th></tr></thead>
              <tbody>
                {data.accounts.map((row) => (
                  <tr key={row.accountId}>
                    <td>{row.nickname || row.accountId.slice(0, 8)}</td>
                    <td>{fmtNum(row.tasks)}</td>
                    <td>{fmtNum(row.ready)}</td>
                    <td>{fmtBytes(row.fileBytes)}</td>
                    <td>{fmtBytes(row.sentBytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.accounts.length ? <p className="cc-muted" style={{ padding: 16 }}>当前范围没有上传记录</p> : null}
            <p className="cc-note">{data.coverage.accountNote}</p>
          </div>
        ) : null}
      </Group>
    </div>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "ok" | "warn" }) {
  return (
    <div className={`ab-stat${tone ? ` tone-${tone}` : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}
