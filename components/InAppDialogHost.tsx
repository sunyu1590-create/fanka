"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { IN_APP_DIALOG_EVENT } from "@/lib/in-app-dialog";

type ConfirmOptions = { title?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean };
type DialogRequest =
  | { kind: "confirm"; message: string; options: ConfirmOptions; resolve: (value: boolean) => void }
  | { kind: "prompt"; message: string; initialValue: string; options: ConfirmOptions; resolve: (value: string | null) => void };

export default function InAppDialogHost() {
  const [queue, setQueue] = useState<DialogRequest[]>([]);
  const [value, setValue] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const current = queue[0];

  useEffect(() => {
    const onRequest = (event: Event) => {
      const request = (event as CustomEvent<DialogRequest>).detail;
      setQueue((items) => [...items, request]);
    };
    window.addEventListener(IN_APP_DIALOG_EVENT, onRequest);
    return () => window.removeEventListener(IN_APP_DIALOG_EVENT, onRequest);
  }, []);

  useEffect(() => {
    if (!current) return;
    setValue(current.kind === "prompt" ? current.initialValue : "");
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); finish(null); }
    };
    window.addEventListener("keydown", onKeyDown);
    window.setTimeout(() => (current.kind === "prompt" ? input.current : document.querySelector<HTMLButtonElement>(".in-app-dialog-confirm"))?.focus(), 0);
    return () => window.removeEventListener("keydown", onKeyDown);
    // finish is stable through the current request and the listener is replaced per dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  const finish = useCallback((result: boolean | string | null) => {
    setQueue((items) => {
      const [head, ...tail] = items;
      if (head) head.resolve(result as never);
      return tail;
    });
  }, []);

  const submitPrompt = (event: FormEvent) => {
    event.preventDefault();
    finish(value);
  };

  if (!current) return null;
  const title = current.options.title || (current.kind === "prompt" ? "请输入内容" : current.options.danger ? "请确认此操作" : "确认操作");

  return <div className="in-app-dialog-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) finish(null); }}>
    <section className="in-app-dialog" role={current.options.danger ? "alertdialog" : "dialog"} aria-modal="true" aria-labelledby="in-app-dialog-title" aria-describedby="in-app-dialog-message">
      <header><span className={current.options.danger ? "is-danger" : ""}><AlertTriangle size={18}/></span><strong id="in-app-dialog-title">{title}</strong><button type="button" aria-label="关闭" onClick={() => finish(null)}><X size={18}/></button></header>
      <p id="in-app-dialog-message">{current.message}</p>
      {current.kind === "prompt" && <form onSubmit={submitPrompt}><input ref={input} value={value} onChange={(event) => setValue(event.target.value)} aria-label="输入内容"/><div className="in-app-dialog-actions"><button type="button" className="in-app-dialog-cancel" onClick={() => finish(null)}>{current.options.cancelLabel || "取消"}</button><button type="submit" className={`in-app-dialog-confirm${current.options.danger ? " is-danger" : ""}`}>{current.options.confirmLabel || "确定"}</button></div></form>}
      {current.kind === "confirm" && <div className="in-app-dialog-actions"><button type="button" className="in-app-dialog-cancel" onClick={() => finish(false)}>{current.options.cancelLabel || "取消"}</button><button type="button" className={`in-app-dialog-confirm${current.options.danger ? " is-danger" : ""}`} onClick={() => finish(true)}>{current.options.confirmLabel || "确定"}</button></div>}
    </section>
  </div>;
}
