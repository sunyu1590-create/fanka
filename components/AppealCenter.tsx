"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Send } from "lucide-react";
import { cloudRequest } from "@/lib/cloud";
import ChoiceSelect from "./ChoiceSelect";

type AppealTarget = { type: string; id: string; title: string; reason: string };
type Appeal = { id: string; target_type: string; target_title: string; reason: string; status: "open" | "accepted" | "rejected"; review_note: string | null; created_at: string; handled_at: string | null };
const labels: Record<string, string> = { content: "作品下架", comment: "评论隐藏", report: "举报处理", account: "账号限制" };

export default function AppealCenter({ accountId, onLogin, onNotice }: { accountId: string | null; onLogin: () => void; onNotice: (message: string) => void }) {
  const [targets, setTargets] = useState<AppealTarget[]>([]);
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [selected, setSelected] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const noticeRef = useRef(onNotice);
  useEffect(() => { noticeRef.current = onNotice; }, [onNotice]);
  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    try { const result = await cloudRequest("/api/v1/appeals") as { targets: AppealTarget[]; items: Appeal[] }; setTargets(result.targets || []); setAppeals(result.items || []); }
    catch (error) { noticeRef.current(error instanceof Error ? error.message : "申诉记录加载失败"); }
    finally { setLoading(false); }
  }, [accountId]);
  useEffect(() => { void load(); }, [load]);
  const submit = async () => {
    if (!accountId) { onLogin(); return; }
    const target = targets.find((item) => `${item.type}:${item.id}` === selected);
    if (!target || reason.trim().length < 3) { onNotice("请选择申诉事项并填写至少 3 个字的说明"); return; }
    setSending(true);
    try { await cloudRequest("/api/v1/appeals", { target_type: target.type, target_id: target.id, reason: reason.trim() }); setReason(""); setSelected(""); onNotice("申诉已提交，处理结果会显示在这里"); await load(); }
    catch (error) { onNotice(error instanceof Error ? error.message : "申诉提交失败"); }
    finally { setSending(false); }
  };
  return <section className="appeal-center" aria-label="申诉中心">
    <div className="appeal-center-heading"><span><AlertCircle size={17}/></span><div><strong>申诉中心</strong><small>对作品下架、评论隐藏、举报处理或账号限制提交复核</small></div></div>
    {targets.length ? <div className="appeal-form"><label>选择申诉事项<ChoiceSelect label="选择申诉事项" value={selected} onChange={setSelected} placeholder="请选择一项" options={[{value:"",label:"请选择一项"},...targets.map((target) => ({value:`${target.type}:${target.id}`,label:`${labels[target.type] || "事项"} · ${target.title}`}))]}/></label>{selected && <p>{targets.find((target) => `${target.type}:${target.id}` === selected)?.reason}</p>}<label>申诉说明<textarea maxLength={1000} rows={4} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="说明你希望重新核查的原因与相关背景"/></label><button type="button" className="primary-button" disabled={sending || reason.trim().length < 3 || !selected} onClick={() => void submit()}><Send size={15}/>{sending ? "提交中…" : "提交申诉"}</button></div> : <p className="appeal-empty">{loading ? "正在读取可申诉事项…" : "当前没有可申诉的处理事项。"}</p>}
    <div className="appeal-history"><h3>申诉记录</h3>{appeals.length ? appeals.map((appeal) => <article key={appeal.id}><div><strong>{labels[appeal.target_type] || "事项"} · {appeal.target_title}</strong><small>{new Date(appeal.created_at).toLocaleString("zh-CN")} · {appeal.status === "open" ? "待复核" : appeal.status === "accepted" ? "申诉通过" : "申诉未通过"}</small></div><p>{appeal.reason}</p>{appeal.review_note && <aside>{appeal.review_note}{appeal.handled_at ? ` · ${new Date(appeal.handled_at).toLocaleString("zh-CN")}` : ""}</aside>}</article>) : !loading && <p className="appeal-empty">还没有提交过申诉。</p>}</div>
  </section>;
}
