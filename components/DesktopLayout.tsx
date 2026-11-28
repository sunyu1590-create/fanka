"use client";
import { Suspense, lazy, useState, useCallback } from "react";
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from "lucide-react";

const BriefingPanel = lazy(() => import("./BriefingPanel"));
const TrendingPanel = lazy(() => import("./TrendingPanel"));

interface DesktopLayoutProps {
  leftNav?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** 右侧面板默认可见 */
  rightPanelVisible?: boolean;
}

export default function DesktopLayout({
  leftNav,
  children,
  className = "",
  rightPanelVisible: initialRight = true,
}: DesktopLayoutProps) {
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(initialRight);
  const [rightTab, setRightTab] = useState<"briefing" | "trending">("briefing");

  return (
    <div className={`desktop-layout ${className} ${leftOpen ? "left-open" : "left-closed"} ${rightOpen ? "right-open" : "right-closed"}`}>
      {/* 左侧导航栏 */}
      {leftNav && (
        <>
          <aside className={`desktop-left ${leftOpen ? "" : "collapsed"}`}>
            {leftOpen && leftNav}
          </aside>
          <button
            className="desktop-left-toggle"
            onClick={() => setLeftOpen(!leftOpen)}
            aria-label={leftOpen ? "收起侧栏" : "展开侧栏"}
          >
            {leftOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
          </button>
        </>
      )}

      {/* 主内容区 */}
      <main className="desktop-main">
        {children}
      </main>

      {/* 右侧面板：简报 / 趋势 */}
      <aside className={`desktop-right ${rightOpen ? "" : "collapsed"}`}>
        {rightOpen && (
          <>
            <div className="desktop-right-tabs">
              <button
                className={`dr-tab ${rightTab === "briefing" ? "active" : ""}`}
                onClick={() => setRightTab("briefing")}
              >
                简报
              </button>
              <button
                className={`dr-tab ${rightTab === "trending" ? "active" : ""}`}
                onClick={() => setRightTab("trending")}
              >
                流行
              </button>
            </div>
            <div className="desktop-right-content">
              <Suspense fallback={<div className="p-4 text-xs text-muted">加载中…</div>}>
                {rightTab === "briefing" ? <BriefingPanel /> : <TrendingPanel limit={15} />}
              </Suspense>
            </div>
          </>
        )}
      </aside>
      <button
        className="desktop-right-toggle"
        onClick={() => setRightOpen(!rightOpen)}
        aria-label={rightOpen ? "收起右侧" : "展开右侧"}
      >
        {rightOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
      </button>
    </div>
  );
}
