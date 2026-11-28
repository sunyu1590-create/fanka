# HEIKA EVOLUTION · 黑卡全域自主进化工程

> 工程代号：HEIKA Evolution
> 启动时间：2026-11-28 08:19 (Asia/Shanghai)
> 基线版本：Web 2.69.0 (d49f9d6) / Android-Native 2.34.0 (code 103)
> 计划有效工程时长：≥ 540 分钟，按需延长

---

## 阶段总览与执行状态

| 阶段 | 内容 | 预算 | 状态 | 产出 |
|---|---|---|---|---|
| 一 | 全应用审计与建立基线 | 30min | ✅ 完成 (08:25) | AUDIT_REPORT.md / PERFORMANCE_BASELINE.md / API_INVENTORY.md |
| 二 | 核心 Bug 与历史遗留问题清理 | 40min | ✅ 完成 (08:47) | ISSUE_TRACKER.md（H1–H15 全量代码级验证） |
| 三 | 全局动效及统一视觉设计系统 | 60min | ✅ 完成 (08:50) | DESIGN_SYSTEM.md / MOTION_SYSTEM.md |
| 四 | 网页端全应用场景体验优化 | 55min | 🔄 进行中 | — |
| 五 | Android APP 全应用场景体验优化 | 55min | ⬜ 待开始 | — |
| 六 | API 接口补齐及后端架构优化 | 60min | ⬜ 待开始 | API_INVENTORY.md |
| 七 | HEIKA Nexus 管理员操控中心升级 | 40min | ⬜ 待开始 | — |
| 八 | 系统设置、通知及信息架构重组 | 40min | ⬜ 待开始 | — |
| 九 | 自主发现问题及新增功能 | 50min | ⬜ 待开始 | DECISION_LOG.md |
| 十 | 性能、安全及极端场景测试 | 40min | ⬜ 待开始 | PERFORMANCE_BASELINE.md / TEST_MATRIX.md |
| 十一 | 反向审查及二次重构 | 30min | ⬜ 待开始 | — |
| 十二 | 构建、提交、部署、APK 上传及线上验收 | 40min | ⬜ 待开始 | RELEASE_REPORT.md |

---

## 档案索引

| 档案 | 用途 |
|---|---|
| MASTER_PLAN.md（本文件） | 总计划与阶段状态 |
| AUDIT_REPORT.md | 全应用结构审计基线 |
| ISSUE_TRACKER.md | 问题追踪清单（持续更新） |
| DESIGN_SYSTEM.md | 统一设计系统及视觉规范 |
| MOTION_SYSTEM.md | 全局动画及交互动效规范 |
| API_INVENTORY.md | 完整接口清单及接入状态 |
| ARCHITECTURE_REVIEW.md | 前端 / APP / 服务端 / 数据库架构审查 |
| PERFORMANCE_BASELINE.md | 性能测试基线 |
| DECISION_LOG.md | 自主功能调整及设计决策 |
| TEST_MATRIX.md | 完整功能测试矩阵 |
| EXECUTION_LOG.md | 实际开发执行记录 |
| CHECKPOINT.md | 任务中断及恢复检查点 |
| RELEASE_REPORT.md | 最终交付及生产环境验收报告 |

---

## 核心执行原则

1. 事实优先：所有结论基于真实工具结果，不臆测、不伪造。
2. 真实证据：重要修改附 DOM 测量 / 截图 / 请求响应 / 性能数据。
3. 允许自我否定：后续审查发现已完成的实现不足，直接推翻重做。
4. 安全边界：不改支付规则、不删生产数据、不降账号安全、不绕权限、不换基础设施。
5. 不提前结束：每个阶段完成后进入下一阶段，直至全部阶段闭环。

---

## 已知阻塞 / 风险登记

| # | 事项 | 影响 | 状态 |
|---|---|---|---|
| R1 | 正式 APK 签名证书是否已配置（GitHub Secrets） | 决定能否产出生产升级包 | ⬜ 待确认 |
| R2 | android-native README 版本(2.21.0/81) 与 gradle(2.34.0/103) 不一致 | 以 gradle 为准，README 待更新 | ⬜ 待修复 |
| R3 | 旧 android/ 与 mobile/ 目录是否可从仓库移除 | 减少混淆 | ⬜ 待决策 |

---

## 执行日志

- 2026-11-28 08:19 工程启动，阶段一审计进行中，档案目录建立。
- 2026-11-28 08:25 阶段一完成：五份档案就绪（MASTER_PLAN/AUDIT_REPORT/ISSUE_TRACKER/PERFORMANCE_BASELINE/API_INVENTORY），无 P0 生产故障，ai-worker 单次 TypeError 已澄清。进入阶段二。
- 2026-11-28 08:50 阶段三完成：动效体系审计 M1–M7 全闭环（时长区间合规、6 条非线性曲线统一、reduce/lite 双降级、animation-coordinator 具备 P0–P3 优先级与四态结算；225 处 CSS 硬编码时长登记为 P3 渐进治理）；设计系统 D1–D5 登记（强调色双语义、圆角多值、硬编码颜色、管理端色彩对齐、主题残留）；零引用接口全部澄清（deck/open 与 me/interests 为 mobile 遗留客户端专用，me/bookmarks 已被 library-state 取代，200 接口无孤立废弃）。进入阶段四。
- 2026-11-28 08:47 阶段二完成：H1–H15 十五项历史遗留问题全部完成代码级验证——翻卡（finally 兜底+revealRepair 自愈）、草稿三分模式（CREATE/DRAFT_EDIT/POST_EDIT）、发布幂等（taskKey=idempotency_key+hashSnapshot）、发布任务持久化（IndexedDB 单例管理器）、聊天（16+ 操作单协议 + postgres_changes 订阅 + 15s 轮询兜底 + 未读频道）、装扮（PATCH 持久化+全局事件）、图片兜底、滚动位置恢复、管理端 1s 单例轮询。13 项代码层已修复/已接通待浏览器实测，2 项（H7 桌面主页、H8/H9 双栏发布）依赖浏览器验收。进入阶段三。
