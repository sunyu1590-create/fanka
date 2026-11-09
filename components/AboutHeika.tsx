"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, BookOpen, Compass, Sparkles } from "lucide-react";
import { APP_VERSION } from "@/lib/version";
import { RELEASES } from "@/lib/release-notes";

export default function AboutHeika({ onBack, onFeedback }: { onBack: () => void; onFeedback: () => void }) {
  const categoryOrder = ["新功能", "体验优化", "问题修复"] as const;
  return <section className="page about-page about-heika-page">
    <button className="back settings-back" onClick={onBack}><ArrowLeft size={18}/> 设置</button>
    <header className="about-brand-block">
      <Image src="/icons/heika-192.png" alt="黑卡品牌标识" width={72} height={72} priority />
      <p className="eyebrow">HEIKA · VERSION {APP_VERSION}</p>
      <h1>黑卡 HEIKA</h1>
      <p className="about-slogan">翻开未知，遇见新的想法。</p>
      <span>探索 · 阅读 · 连接</span>
    </header>
    <section className="about-section about-introduction"><h2>认识黑卡</h2><p>黑卡是一个以探索、阅读和分享为核心的内容社区。</p><p>我们相信，发现不应该只是不断滑动屏幕，也可以是一次充满期待的主动选择。</p><p>在这里，你可以翻开未知的卡片，阅读感兴趣的知识与故事，分享自己的想法，也可以遇见与你拥有相同兴趣的人。</p><p>让探索成为习惯，让阅读重新拥有期待。</p></section>
    <section className="about-section"><h2>核心功能</h2><div className="about-feature-grid">
      <article><Compass size={19}/><h3>每日翻卡</h3><p>从候选卡片中选择每天想要翻开的五张，探索未知内容。</p></article>
      <article><BookOpen size={19}/><h3>发现社区</h3><p>阅读、收藏、评价和分享作品，与其他人交流不同观点。</p></article>
      <article><Sparkles size={19}/><h3>AI 专区</h3><p>发现 AI 知识、Agent、Skill、Prompt 与实用工具。</p></article>
    </div></section>
    <section className="about-section about-developer"><h2>关于开发者</h2><strong>个人开发者</strong><p>黑卡始于一个简单的想法：能不能让发现内容这件事，变得更有趣一些？</p><p>从翻开第一张卡片，到逐渐形成一个可以阅读、分享与交流的社区，黑卡仍在不断成长。</p><p>我会继续完善体验，倾听反馈，让每一次更新都带来有价值的改变。</p></section>
    <section className="about-section about-releases"><div className="about-section-heading"><h2>版本更新</h2><span>{APP_VERSION}</span></div>
      {RELEASES.map((release, index) => <details className="about-release" key={release.version} open={index === 0}><summary><strong>版本 {release.version}</strong><span>{release.date || "本次更新"}</span></summary><div className="about-release-body">{categoryOrder.map((category) => { const notes = release.notes.filter((note) => note.category === category); return notes.length ? <section key={category}><h3>{category}</h3><ul>{notes.map((note, noteIndex) => <li key={`${note.category}-${noteIndex}`}>{note.text}</li>)}</ul></section> : null; })}</div></details>)}
      <details className="about-release-history"><summary>查看版本历史 · {RELEASES.length} 个版本</summary><div className="about-release-history-list">{RELEASES.slice(1).map((release) => <span key={release.version}>版本 {release.version}{release.date ? ` · ${release.date}` : ""}</span>)}</div></details>
    </section>
    <section className="about-links"><Link href="/" className="about-link"><span>访问网页版</span><ArrowUpRight size={17}/></Link><button type="button" className="about-link" onClick={onFeedback}><span>意见反馈</span><ArrowUpRight size={17}/></button><div className="about-legal-status"><strong>用户协议与隐私政策</strong><span>正式文本正在准备，完成审核后开放查看。</span></div></section>
    <section className="about-thanks"><p>感谢你愿意来到这里。</p><p>希望黑卡能为你的日常生活带来一点新的发现，也希望你能在这里留下自己的故事。</p><p>好奇心不会停止，探索也不会。</p></section>
    <footer className="about-footer"><strong>HEIKA · 黑卡</strong><span>由个人开发者创造</span></footer>
  </section>;
}
