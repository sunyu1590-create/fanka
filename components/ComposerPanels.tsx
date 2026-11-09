"use client";

import { memo, useEffect, useLayoutEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ImagePlus } from "lucide-react";

/** Shared sheet keeps the editor mounted, restores focus and traps keyboard navigation. */
export function ComposerSheet({ title, children, onClose, full = false }: { title: string; children: ReactNode; onClose: () => void; full?: boolean }) {
  const label = useId();
  const root = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    root.current?.focus();
    const keys = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close.current(); }
      if (event.key !== "Tab") return;
      const focusable = [...(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),[tabindex="0"],summary,a[href]') || [])].filter((item) => item.getClientRects().length);
      const first = focusable[0], last = focusable.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === root.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    root.current?.addEventListener("keydown", keys);
    const element = root.current;
    return () => { element?.removeEventListener("keydown", keys); document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  return createPortal(<div className={`composer-sheet-backdrop${full ? " is-full" : ""}`} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}><div ref={root} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={label} className="composer-sheet"><header><button type="button" aria-label={`返回编辑，当前：${title}`} onClick={onClose}><ArrowLeft size={19}/></button><h2 id={label}>{title}</h2><button type="button" onClick={onClose}>完成</button></header><div className="composer-sheet-scroll">{children}</div></div></div>, document.body);
}

export const ComposerTextEditor = memo(function ComposerTextEditor({ title, body, error, onTitle, onBody }: { title: string; body: string; error: "" | "title" | "body"; onTitle: (value: string) => void; onBody: (value: string) => void }) {
  const titleRef = useRef<HTMLTextAreaElement>(null), bodyRef = useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = useState(false);
  useLayoutEffect(() => { for (const element of [titleRef.current, bodyRef.current]) if (element) { element.style.height = "auto"; element.style.height = `${element.scrollHeight}px`; } }, [title, body]);
  useEffect(() => {
    let width=0;
    const resize = () => {
      const nextWidth=titleRef.current?.clientWidth || 0;
      if(nextWidth===width)return; width=nextWidth;
      for(const element of [titleRef.current,bodyRef.current]) if(element){element.style.height="auto";element.style.height=`${element.scrollHeight}px`;}
    };
    const observer=typeof ResizeObserver!=="undefined"?new ResizeObserver(resize):null;
    if(titleRef.current)observer?.observe(titleRef.current);
    window.addEventListener("resize",resize);resize();
    return()=>{observer?.disconnect();window.removeEventListener("resize",resize);};
  }, []);
  const insert = (before: string, after = "") => {
    const input = bodyRef.current;
    if (!input) return;
    const start = input.selectionStart, end = input.selectionEnd;
    const selected = body.slice(start, end);
    const next = `${body.slice(0, start)}${before}${selected}${after}${body.slice(end)}`;
    if (next.length > 5000) return;
    onBody(next);
    requestAnimationFrame(() => { input.focus(); input.setSelectionRange(start + before.length, end + before.length); });
  };
  return <section className="composer-writing" aria-label="创作编辑区">
    <label className="composer-title-field"><span className="sr-only">标题</span><textarea ref={titleRef} value={title} onChange={(event) => onTitle(event.target.value.replace(/\n/g, ""))} maxLength={80} rows={1} placeholder="为内容写一个标题" aria-label="标题" aria-invalid={error === "title"}/><small className="composer-field-count">{title.length}/80</small></label>
    {error === "title" && <p role="alert" className="composer-field-error">请填写标题。</p>}
    <label className="composer-body-field"><span className="sr-only">正文</span><textarea ref={bodyRef} value={body} onChange={(event) => onBody(event.target.value)} maxLength={5000} rows={6} placeholder="写下你想分享的内容…" aria-label="正文" aria-invalid={error === "body"} onFocus={() => setFocused(true)} onBlur={(event) => { if (!(event.relatedTarget as HTMLElement | null)?.closest(".composer-markdown-tools")) setFocused(false); }}/><small className="composer-field-count">{body.length}/5000 · Markdown</small></label>
    {error === "body" && <p role="alert" className="composer-field-error">请填写正文。</p>}
    {focused && <div className="composer-markdown-tools" role="toolbar" aria-label="Markdown 工具栏" onMouseDown={(event) => event.preventDefault()}>{[["粗体", "**", "**"], ["标题", "\n## ", ""], ["引用", "\n> ", ""], ["列表", "\n- ", ""], ["链接", "[", "](https://)"]].map(([label,before,after]) => <button type="button" key={label} onClick={() => insert(before,after)}>{label}</button>)}</div>}
  </section>;
});

type Media = { id: string; url: string; status: string };
export const ComposerMediaStrip = memo(function ComposerMediaStrip({ images, coverIndex, busy, onSelect, onRetry, onMove, onAdd }: { images: Media[]; coverIndex: number; busy: boolean; onSelect: (id: string) => void; onRetry: (id: string) => void; onMove: (from: number, to: number) => void; onAdd: (files: FileList | null) => void }) {
  const root = useRef<HTMLDivElement>(null), dragId = useRef<string | null>(null), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const mouse = useRef<{id:string;x:number;y:number} | null>(null);
  const suppressClick = useRef(0);
  const imagesRef = useRef(images), moveRef = useRef(onMove);
  imagesRef.current = images; moveRef.current = onMove;
  useEffect(() => {
    const element = root.current;
    const move = (event: TouchEvent) => {
      if (!dragId.current) return;
      event.preventDefault();
      const touch = event.touches[0]; if (!touch) return;
      const target = document.elementFromPoint(touch.clientX,touch.clientY)?.closest<HTMLElement>("[data-composer-image]");
      const from = imagesRef.current.findIndex((image) => image.id === dragId.current), to = Number(target?.dataset.index);
      if (target && from >= 0 && to !== from) moveRef.current(from,to);
    };
    const end = () => { if (timer.current) clearTimeout(timer.current); if(dragId.current) suppressClick.current=Date.now()+300; dragId.current = null; setActive(null); };
    element?.addEventListener("touchmove",move,{passive:false});
    element?.addEventListener("touchend",end); element?.addEventListener("touchcancel",end);
    return () => { end(); element?.removeEventListener("touchmove",move); element?.removeEventListener("touchend",end); element?.removeEventListener("touchcancel",end); };
  }, []);
  const moveAt = (x:number,y:number) => {
    const element=root.current;if(!element||!dragId.current)return;
    const bounds=element.getBoundingClientRect();
    if(x<bounds.left+28)element.scrollLeft-=14;else if(x>bounds.right-28)element.scrollLeft+=14;
    const target=document.elementFromPoint(x,y)?.closest<HTMLElement>("[data-composer-image]");
    const from=imagesRef.current.findIndex(image=>image.id===dragId.current),to=Number(target?.dataset.index);
    if(target&&from>=0&&from!==to)moveRef.current(from,to);
  };
  return <div ref={root} className="composer-media-strip" aria-label="内容图片"
    onPointerDown={event=>{if(event.pointerType!=="mouse"||event.button!==0||busy)return;const target=(event.target as HTMLElement).closest<HTMLElement>("[data-composer-image]");if(target?.dataset.composerImage)mouse.current={id:target.dataset.composerImage,x:event.clientX,y:event.clientY};}}
    onPointerMove={event=>{const start=mouse.current;if(!start)return;if(!dragId.current&&Math.hypot(event.clientX-start.x,event.clientY-start.y)<6)return;event.preventDefault();dragId.current=start.id;setActive(start.id);if(!event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.setPointerCapture(event.pointerId);moveAt(event.clientX,event.clientY);}}
    onPointerUp={event=>{if(dragId.current)suppressClick.current=Date.now()+300;mouse.current=null;dragId.current=null;setActive(null);if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}}
    onPointerCancel={()=>{mouse.current=null;dragId.current=null;setActive(null);}}>
    {images.map((image,index)=><figure key={image.id} data-composer-image={image.id} data-index={index} draggable={false} className={active===image.id?"is-dragging":""}
      onTouchStart={()=>{if(!busy)timer.current=setTimeout(()=>{dragId.current=image.id;setActive(image.id);},350);}}
      onTouchMove={()=>{if(!dragId.current&&timer.current)clearTimeout(timer.current);}}>
      <button type="button" draggable={false} aria-label={`预览第 ${index+1} 张图片`} onClick={()=>{if(Date.now()>suppressClick.current)onSelect(image.id);}}><img src={image.url} alt={`第 ${index+1} 张图片`} draggable={false}/></button>
      {coverIndex===index&&<span className="composer-cover-badge">封面</span>}
      {image.status==="uploading"&&<span className="composer-image-state">上传中…<progress aria-label={`第 ${index+1} 张图片上传中`}/></span>}
      {image.status==="failed"&&<button type="button" className="composer-image-retry" disabled={busy} onClick={()=>onRetry(image.id)}>失败 · 重试</button>}
    </figure>)}
    {images.length<9&&<label className="composer-media-add"><ImagePlus size={23}/><span>添加图片</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy} onChange={event=>{onAdd(event.target.files);event.currentTarget.value="";}}/></label>}
  </div>;
});
