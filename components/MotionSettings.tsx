"use client";

import { useState } from "react";
import {
  DEFAULT_MOTION, MOTION_MODES, MOTION_SPEEDS, applyMotionSettings, resetMotionSettings,
  type MotionSettings,
} from "@/lib/motion";

type Props = { settings: MotionSettings; onChange: (next: MotionSettings) => void; onNotice: (text: string) => void };

/** 动效设置：所有选项都直接作用于全局动效系统，无装饰性空开关。 */
export default function MotionSettings({ settings, onChange, onNotice }: Props) {
  const [busy, setBusy] = useState(false);
  const update = (patch: Partial<MotionSettings>) => {
    const next = { ...settings, ...patch };
    onChange(next);
    applyMotionSettings(next);
  };
  const reset = () => {
    setBusy(true);
    const next = resetMotionSettings();
    onChange(next);
    onNotice("动效设置已恢复默认");
    setBusy(false);
  };

  return (
    <div className="motion-settings">
      <section className="motion-group">
        <h3>动效模式</h3>
        <div className="preference-options" role="radiogroup" aria-label="动效模式">
          {MOTION_MODES.map((item) => (
            <button key={item.value} type="button" role="radio" aria-checked={settings.mode === item.value}
              className={`preference-option${settings.mode === item.value ? " selected" : ""}`}
              onClick={() => update({ mode: item.value })}>
              <span className="preference-option-copy"><strong>{item.label}</strong><small>{item.description}</small></span>
              <i className="preference-check">{settings.mode === item.value ? "✓" : ""}</i>
            </button>
          ))}
        </div>
      </section>

      <section className="motion-group">
        <h3>动画速度</h3>
        <div className="preference-options" role="radiogroup" aria-label="动画速度">
          {MOTION_SPEEDS.map((item) => (
            <button key={item.value} type="button" role="radio" aria-checked={settings.speed === item.value}
              className={`preference-option${settings.speed === item.value ? " selected" : ""}`}
              onClick={() => update({ speed: item.value })}>
              <span className="preference-option-copy"><strong>{item.label}</strong><small>时长系数 {item.scale}×</small></span>
              <i className="preference-check">{settings.speed === item.value ? "✓" : ""}</i>
            </button>
          ))}
        </div>
      </section>

      <section className="motion-group">
        <h3>材质与性能</h3>
        <div className="settings-list">
          <button type="button" className="settings-row" onClick={() => update({ glass: !settings.glass })} aria-pressed={settings.glass}>
            <span>固态玻璃效果</span><span className="settings-row-value">{settings.glass ? "已开启" : "已关闭 · 轻量材质"}</span>
          </button>
          <button type="button" className="settings-row" onClick={() => update({ highRefresh: !settings.highRefresh })} aria-pressed={settings.highRefresh}>
            <span>高刷新率适配</span><span className="settings-row-value">{settings.highRefresh ? "已开启" : "标准"}</span>
          </button>
        </div>
        <p className="fineprint">关闭玻璃后使用不透明的轻量替代材质，文字与图标保持可读；减少动态效果模式下大幅位移、3D 翻转与视差会自动停用。</p>
      </section>

      <div className="motion-actions">
        <button type="button" className="soft-button" disabled={busy} onClick={reset}>恢复默认设置</button>
        <span className="fineprint">当前默认：{DEFAULT_MOTION.mode === "standard" ? "标准模式 · 标准速度" : "标准"}</span>
      </div>
    </div>
  );
}
