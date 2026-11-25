"use client";

import { useCallback, useEffect, useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { cloudRequest } from "@/lib/cloud";
import { privilegedRequest } from "@/lib/reauth-client";
import { confirmInApp } from "@/lib/in-app-dialog";
import { Empty, fmtBytes, fmtTime, Group } from "./admin/AdminUIKit";

type TrashRow = { id: string; resource_kind: string; resource_key: string; display_name: string | null; size_bytes: number; deleted_at: string; purge_after: string; restored_at: string | null; meta: { bucket?: string; name?: string } };
type Payload = { items: TrashRow[]; totals: { count: number; bytes: number; expiring: number }; retention_days: number; note?: string };

export default function AdminTrash({ onNotice }: { onNotice: (text: string) => void }) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await cloudRequest("/api/v1/admin/resources/trash");
      if (result) { setData(result as Payload); setError(""); }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "回收站读取失败");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const act = async (row: TrashRow, action: "restore" | "purge") => {
    const ok = await confirmInApp(
      action === "restore" ? `恢复 ${row.display_name || row.resource_key} 到原路径？` : `永久删除 ${row.display_name || row.resource_key}？此操作不可撤销。`,
      { title: action === "restore" ? "恢复资源" : "永久删除", confirmLabel: action === "restore" ? "恢复" : "永久删除", danger: action === "purge" },
    );
    if (!ok) return;
    setBusy(row.id);
    try {
      await (action === "purge" ? privilegedRequest("/api/v1/admin/resources/trash", { action, id: row.id }) : cloudRequest("/api/v1/admin/resources/trash", { action, id: row.id }));
      onNotice(action === "restore" ? "已恢复到原路径" : "已永久删除");
      await load();
    } catch (cause) {
      onNotice(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="cc-stack">
      <div className="ab-stat-grid">
        <div className="ab-stat"><span>回收站对象</span><strong>{data?.totals.count ?? "—"}</strong><small>默认保留 7 天</small></div>
        <div className="ab-stat"><span>占用空间</span><strong>{fmtBytes(data?.totals.bytes)}</strong><small>未释放</small></div>
        <div className="ab-stat"><span>即将到期</span><strong>{data?.totals.expiring ?? "—"}</strong><small>2 天内</small></div>
      </div>

      <Group>
        <div className="ab-card__head" style={{ marginBottom: 8 }}><span className="ab-card__title">已删除资源</span><span className="ab-card__badge">永久删除前会再次校验引用</span></div>
        {error ? <Empty title="回收站不可用" hint={error} /> : !data ? <Empty title="正在读取回收站" /> : !data.items.length ? <Empty title="回收站为空" hint="删除资源时会先进入这里，不会立即销毁文件" /> : (
          <div className="cc-tablewrap">
            <table className="cc-table">
              <thead><tr><th>文件</th><th>类型</th><th>大小</th><th>删除时间</th><th>到期</th><th /></tr></thead>
              <tbody>
                {data.items.map((row) => (
                  <tr key={row.id} style={{ opacity: row.restored_at ? .45 : 1 }}>
                    <td>{row.display_name || row.resource_key}<small> {row.meta?.bucket || ""}</small></td>
                    <td>{row.resource_kind}</td>
                    <td>{fmtBytes(row.size_bytes)}</td>
                    <td>{fmtTime(row.deleted_at)}</td>
                    <td>{row.restored_at ? "已恢复" : fmtTime(row.purge_after)}</td>
                    <td>
                      {row.restored_at ? null : (
                        <div className="cc-actions">
                          <button type="button" className="cc-btn" disabled={busy === row.id} onClick={() => void act(row, "restore")}><RotateCcw size={13} />恢复</button>
                          <button type="button" className="cc-btn danger" disabled={busy === row.id} onClick={() => void act(row, "purge")}><Trash2 size={13} />永久删除</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="cc-note">{data?.note || "系统关键资源（APK、Logo、默认头像、官方封面、轮播图、备份）不允许删除。"}</p>
      </Group>
    </div>
  );
}
