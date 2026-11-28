# MOTION_SYSTEM · 全局动画及交互动效规范

> 建立时间：2026-11-28 08:48
> 事实来源：app/motion.css (184 行) + lib/motion.ts (218 行) + lib/animation-coordinator.ts (107 行)
> 结论：HEIKA Motion 2.0 已存在完整体系，本档案为规范固化与后续审计基准，不是从零重建。

---

## 1. 体系架构（三层）

| 层 | 载体 | 职责 |
|---|---|---|
| 令牌层 | motion.css :root | 时长/曲线/玻璃模糊的单一来源，CSS 与 JS 一一对应 |
| 运行层 | lib/motion.ts MotionController | 读写用户设置、计算实际时长、派发设置变更 |
| 协调层 | lib/animation-coordinator.ts | 多动画并发时的互斥与中断（防抢资源） |

边界纪律（motion.css 文件头明示）：
- 禁止对 * 全局加 transform/opacity 过渡——会接管共享元素与翻卡。
- 动效层不碰业务逻辑、不碰 UI 结构、不计算 backdrop-filter（玻璃由令牌控制）。
- 已有成熟动画（共享元素、翻卡）保留专属参数，只经 motionScale() 受速度档位影响。

---

## 2. 时长令牌表（基准 ms，实际值 = 基准 × --motion-scale）

| 令牌 | 基准 | 用途 |
|---|---|---|
| --motion-press | 100 | 按压反馈 |
| --motion-icon | 150 | 图标状态切换 |
| --motion-toggle | 160 | 开关切换 |
| --motion-tag | 200 | 标签选中 |
| --motion-local | 210 | 局部内容更新 |
| --motion-menu | 300 | 菜单展开 |
| --motion-theme | 320 | 主题切换窗口 |
| --motion-card | 400 | 卡片展开 |
| --motion-flip | 640 | 翻卡连续转场 |

兼容层旧令牌（design-system.css 大量组件引用，统一乘 scale）：
--motion-fast:160 / --motion-base:300 / --motion-page:260 / --motion-blur:280 / --motion-indicator:240 / --motion-switch:200 / --motion-expand:420

与总指令建议区间对照：微交互 100–180ms 命中（press/icon/toggle）；普通过渡 180–280ms 命中（tag/local/page/blur/indicator/switch）；页面与复杂容器 280–420ms 命中（menu/theme/card/expand）；大型连续动画 640ms（翻卡专属，允许）。

---

## 3. 缓动曲线（统一非线性，禁止线性）

| 令牌 | 值 | 语义 |
|---|---|---|
| --ease-standard | cubic-bezier(.22,.72,.18,1) | 标准响应 |
| --ease-in-out | cubic-bezier(.42,0,.58,1) | 对称进出 |
| --ease-open | cubic-bezier(.20,.75,.25,1) | 展开（快起慢停） |
| --ease-close | cubic-bezier(.32,.72,.20,1) | 收起 |
| --ease-expand | cubic-bezier(.25,.80,.25,1) | 空间展开 |
| --ease-spatial | cubic-bezier(.22,.78,.18,1) | 共享元素位移 |

---

## 4. 用户可控动效（四模式 × 三速度）

### 模式（html[data-motion-mode]）
| 模式 | 行为 |
|---|---|
| enhanced | 完整连续转场与翻卡动效，仍受性能约束 |
| standard | 视觉与性能平衡（默认） |
| lite | 关闭装饰性循环动画（decor-ambient/ambient-pulse/shimmer），保留状态反馈；scale 上限 0.85 |
| reduce | 遵循无障碍，去除大幅位移与旋转；scale 上限 0.35 |

### 速度（html[data-motion-speed] → --motion-scale）
| 档位 | scale |
|---|---|
| fast | 0.78 |
| standard | 1 |
| calm | 1.28 |

### 无障碍优先级（lib/motion.ts:prefersReducedMotion）
1. 用户显式选择 reduce → 强制减少
2. 用户选择 standard/enhanced 且系统 prefers-reduced-motion: reduce → 尊重系统
3. lite 模式不因系统设置而进一步降级（已独立控制）

---

## 5. 固态玻璃令牌（与动效解耦但同文件托管）

| 令牌 | 值 |
|---|---|
| --glass-blur-nav | 16px |
| --glass-blur-sheet | 14px |
| --glass-blur-chip | 12px |
| --glass-saturate | 130% |
| --glass-bg-dark | rgba(28,32,38,.64) |
| --glass-bg-light | rgba(248,247,243,.72) |

规范：模糊强度锁定 12–18px 区间，禁止各页自定；减少多层玻璃叠加。

---

## 6. 审计结论与待办

| # | 事项 | 结论 | 状态 |
|---|---|---|---|
| M1 | 时长区间是否符合总指令建议 | 全部命中建议区间 | 已确认 |
| M2 | 是否统一非线性曲线 | 6 条曲线全部 cubic-bezier | 已确认 |
| M3 | 无障碍支持 | reduce 模式 + 系统偏好双通道 | 已确认 |
| M4 | 低性能降级 | lite 模式关循环动画、scale 上限 | 已确认 |
| M5 | 组件硬编码时长 | 全量扫描完成：app/*.css 共 225 处 transition 硬编码毫秒（admin-bento.css 19、style.css 15、nexus/control-center 各 6、reader/public-profile/home-banners/composer 各 5）；TSX 内联时长仅 1 处（Community.tsx:2371 duration:240）。结论：CSS 层存在历史遗留，但均属各页私有过渡，非核心动画路径；批量替换收益低、无浏览器验证下回归风险高，列为 P3 渐进治理 | 已审计·列为 P3 |
| M6 | 不可见页面暂停动画 | visibilityState 门控共 18 处（覆盖轮询刷新/订阅/消息加载）；animation-play-state 暂停仅 home-banners.css 与 nexus.css 两处（装饰循环动画，恰好是 lite 模式关闭的对象）；管理端 admin-live 已确认不可见即暂停。结论：状态与数据类循环均有门控，CSS 装饰动画已定向暂停 | 已审计·合规 |
| M7 | 动画中断/反向执行 | animation-coordinator.ts 已具备：P0–P3 优先级、同 key 新动画自动 cancel 旧动画、超时兜底（timed_out）、四态结算（completed/cancelled/timed_out/failed）、onFinish/onCancel/onSettled 回调分离；Animation 对象直接接管，浏览器原生支持从当前进度反向 | 已审计·机制健全 |

---

## 7. 规范执行要求

1. 新增动画一律从 --motion-* / DURATION 取参数，禁止硬编码毫秒值。
2. 新增动画一律使用 --ease-* 曲线，禁止 linear（进度条等语义性线性除外）。
3. 动画属性优先 transform / opacity，避免触发布局的 width/height/top/left。
4. 持续动画必须有可见性门控（document.visibilityState）。
5. 共享元素与翻卡保留专属参数，不得被全局规则覆盖。
