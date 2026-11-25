"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, Globe2, RefreshCw, Search } from "lucide-react";
import { cloudRequest } from "@/lib/cloud";
import { Empty, fmtBytes, fmtNum, fmtTime, Group, Segmented } from "./admin/AdminUIKit";

type TcpTotals = { total: number; established: number; time_wait: number; close_wait: number; listen: number; by_state: Array<{ state: string; count: number }>; inbound: number; outbound: number };
type TcpRow = { state: string; local_ip: string | null; local_port: number | null; remote_ip: string | null; remote_port: number | null; process: string | null; pid: number | null; direction: string | null; first_seen: string | null };
type IpItem = {
  ip: string; requests: number; bytes_in: number; bytes_out: number; errors: number; error_rate: number;
  avg_ms: number | null; first_seen: string | null; last_seen: string | null; client: string | null; country: string | null;
  concurrent: number; accounts: Array<{ id: string; nickname: string }>; top_paths: Array<{ path: string; count: number }>;
  rules: Array<{ id: string; action: string; scope: string; expires_at: string | null }>;
};

/** 网络与连接：TCP 实时快照 + IP 访问分析，全部来自真实采集。 */
export default function AdminNetwork({ view }: { view: "tcp" | "ips" }) {
  return view === "tcp" ? <TcpPanel /> : <IpPanel />;
}

function TcpPanel() {
  const [data, setData] = useState<{ available: boolean; reason?: string; captured_at: string | null; stale: boolean; totals: TcpTotals; items: TcpRow[]; total: number; note?: string } | null>(null);
  const [state, setState] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const timer = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (state) params.set("state", state);
      if (query.trim()) params.set("q", query.trim());
      const result = await cloudRequest(`/api/v1/admin/network/tcp?${params.toString()}`);
      if (result) { setData(result as typeof data); setError(""); }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "TCP 数据读取失败");
    } finally {
      setLoading(false);
    }
  }, [state, query]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    // 可见时 5 秒刷新，页面隐藏即停，避免后台空转。
    const tick = () => { if (document.visibilityState === "visible") void load(); };
    timer.current = window.setInterval(tick, 5000);
    return () => { if (timer.current) window.clearInterval(timer.current); };
  }, [load]);

  if (loading) return <Group><Empty title="正在读取 TCP 快照" hint="采集间隔 60 秒" /></Group>;
  if (error) return <Group><Empty title="TCP 数据不可用" hint={error} /></Group>;
  if (!data?.available) return <Group><Empty title="尚未采集到 TCP 连接" hint={data?.reason || "请确认 fanka-metrics 已挂载宿主机 /proc"} /></Group>;

  const totals = data.totals;
  const max = Math.max(1, ...(totals.by_state || []).map((item) => item.count));
  return (
    <div className="cc-stack">
      <div className="ab-stat-grid">
        <Stat label="连接总数" value={fmtNum(totals.total)} hint={data.captured_at ? `快照 ${fmtTime(data.captured_at)}` : ""} />
        <Stat label="ESTABLISHED" value={fmtNum(totals.established)} hint="活跃连接" tone="ok" />
        <Stat label="TIME_WAIT" value={fmtNum(totals.time_wait)} hint="短连接回收中" />
        <Stat label="CLOSE_WAIT" value={fmtNum(totals.close_wait)} hint="等待应用关闭" tone={totals.close_wait > 50 ? "warn" : undefined} />
      </div>

      {data.stale ? <div className="cc-notice warn">快照已超过 90 秒未更新，实时性下降。</div> : null}

      <Group>
        <div className="ab-card__head" style={{ marginBottom: 10 }}>
          <span className="ab-card__title">状态分布</span>
          <span className="ab-card__badge">入站 {fmtNum(totals.inbound)} · 出站 {fmtNum(totals.outbound)}（明细样本）</span>
        </div>
        <div className="cc-bars">
          {totals.by_state.map((item) => (
            <div key={item.state} className="cc-bars__row">
              <span>{item.state}</span>
              <i><b style={{ width: `${Math.max(2, (item.count / max) * 100)}%` }} /></i>
              <em>{fmtNum(item.count)}</em>
            </div>
          ))}
          {!totals.by_state.length ? <p className="cc-muted">暂无状态数据</p> : null}
        </div>
      </Group>

      <Group>
        <div className="ab-toolbar">
          <Segmented value={state} onChange={setState} options={[{ value: "", label: "全部" }, { value: "ESTABLISHED", label: "ESTABLISHED" }, { value: "TIME_WAIT", label: "TIME_WAIT" }, { value: "CLOSE_WAIT", label: "CLOSE_WAIT" }, { value: "SYN_RECV", label: "SYN_RECV" }]} />
          <label className="ab-search">
            <Search size={14} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="IP / 端口 / 进程" aria-label="筛选 TCP 连接" />
          </label>
          <button type="button" className="ab-iconbtn" onClick={() => void load()} aria-label="刷新"><RefreshCw size={15} /></button>
        </div>
        <div className="cc-tablewrap">
          <table className="cc-table">
            <thead><tr><th>状态</th><th>本地</th><th>远端</th><th>进程</th><th>方向</th><th>首次观测</th></tr></thead>
            <tbody>
              {data.items.map((row, index) => (
                <tr key={`${row.local_ip}-${row.local_port}-${row.remote_ip}-${row.remote_port}-${index}`}>
                  <td><span className={`cc-state ${row.state === "ESTABLISHED" ? "ok" : row.state === "CLOSE_WAIT" ? "warn" : ""}`}>{row.state}</span></td>
                  <td className="cc-mono">{row.local_ip || "—"}:{row.local_port ?? "—"}</td>
                  <td className="cc-mono">{row.remote_ip || "—"}:{row.remote_port ?? "—"}</td>
                  <td>{row.process || "—"}{row.pid ? <small> #{row.pid}</small> : null}</td>
                  <td>{row.direction === "inbound" ? "入站" : row.direction === "outbound" ? "出站" : "本机"}</td>
                  <td>{row.first_seen ? fmtTime(row.first_seen) : "本进程启动后"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.items.length ? <p className="cc-muted" style={{ padding: 16 }}>没有匹配的连接</p> : null}
        </div>
        <p className="cc-note">明细最多保留 200 条；内核不提供单连接累计字节，该列不填估算值。</p>
      </Group>
    </div>
  );
}

function IpPanel() {
  const [range, setRange] = useState<"1d" | "7d" | "30d">("1d");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"requests" | "bytes" | "last_seen" | "errors">("requests");
  const [data, setData] = useState<{ items: IpItem[]; totals: { unique_ips: number; requests: number; bytes: number; errors: number; online_5m: number; logged_accounts: number }; concurrent_at: string | null; note?: string } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ range, sort });
      if (query.trim()) params.set("q", query.trim());
      const result = await cloudRequest(`/api/v1/admin/network/ips?${params.toString()}`);
      if (result) { setData(result as typeof data); setError(""); }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "IP 数据读取失败");
    } finally {
      setLoading(false);
    }
  }, [range, sort, query]);

  useEffect(() => { void load(); }, [load]);

  const totals = data?.totals;
  return (
    <div className="cc-stack">
      <div className="ab-stat-grid">
        <Stat label="独立 IP" value={fmtNum(totals?.unique_ips)} hint="按真实访问日志去重" />
        <Stat label="请求总数" value={fmtNum(totals?.requests)} hint="含页面与 API" />
        <Stat label="5 分钟在线" value={fmtNum(totals?.online_5m)} hint="最近请求时间窗口" tone="ok" />
        <Stat label="已登录账号" value={fmtNum(totals?.logged_accounts)} hint="IP ≠ 用户" />
      </div>

      <Group>
        <div className="ab-toolbar">
          <Segmented value={range} onChange={setRange} options={[{ value: "1d", label: "今天" }, { value: "7d", label: "近 7 天" }, { value: "30d", label: "近 30 天" }]} />
          <Segmented value={sort} onChange={setSort} options={[{ value: "requests", label: "请求" }, { value: "bytes", label: "流量" }, { value: "errors", label: "错误" }, { value: "last_seen", label: "最近" }]} />
          <label className="ab-search">
            <Search size={14} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="筛选 IP" aria-label="筛选 IP" />
          </label>
        </div>
        {loading ? <Empty title="正在汇总访问日志" /> : error ? <Empty title="IP 数据不可用" hint={error} /> : !data?.items.length ? <Empty title="暂无访问记录" hint={data?.note} /> : (
          <div className="cc-tablewrap">
            <table className="cc-table">
              <thead><tr><th>IP</th><th>请求</th><th>流量</th><th>并发</th><th>错误率</th><th>最近访问</th><th>账号</th><th>限制</th></tr></thead>
              <tbody>
                {data.items.map((item) => (
                  <FragmentRow key={item.ip} item={item} open={open === item.ip} onToggle={() => setOpen(open === item.ip ? null : item.ip)} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="cc-note">并发来自最新 TCP 快照；归属地字段需 GeoIP 库，未配置时显示为空，不做猜测。</p>
      </Group>
    </div>
  );
}

function FragmentRow({ item, open, onToggle }: { item: IpItem; open: boolean; onToggle: () => void }) {
  return (
    <>
      <tr className="cc-rowlink" onClick={onToggle}>
        <td className="cc-mono">{item.ip}{item.country ? <small> {item.country}</small> : null}</td>
        <td>{fmtNum(item.requests)}</td>
        <td>{fmtBytes(item.bytes_in + item.bytes_out)}</td>
        <td>{item.concurrent || "—"}</td>
        <td className={item.error_rate > 0.05 ? "warn" : ""}>{item.error_rate ? `${(item.error_rate * 100).toFixed(1)}%` : "0%"}</td>
        <td>{item.last_seen ? fmtTime(item.last_seen) : "—"}</td>
        <td>{item.accounts.length ? item.accounts.map((account) => account.nickname).join("、") : "未关联"}</td>
        <td>{item.rules.length ? item.rules.map((rule) => rule.action === "block" ? "封禁" : "限流").join("、") : "无"}</td>
      </tr>
      {open ? (
        <tr className="cc-expand">
          <td colSpan={8}>
            <div className="cc-expand__grid">
              <div><strong>首次访问</strong><span>{item.first_seen ? fmtTime(item.first_seen) : "—"}</span></div>
              <div><strong>平均耗时</strong><span>{item.avg_ms == null ? "不可用" : `${item.avg_ms} ms`}</span></div>
              <div><strong>客户端</strong><span>{item.client || "未知"}</span></div>
              <div><strong>访问接口</strong><span>{item.top_paths.map((path) => `${path.path}（${path.count}）`).join("；") || "—"}</span></div>
            </div>
          </td>
        </tr>
      ) : null}
    </>
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
