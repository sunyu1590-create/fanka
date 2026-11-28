# ISSUE_TRACKER · 问题追踪清单

> 建立时间：2026-11-28 08:21
> 状态图例：⬜ 未开始 / 🔄 进行中 / ✅ 已修复已验证 / ⚠️ 已修复待验证 / ❌ 阻塞 / 🔁 重新打开
> 优先级：P0 阻断核心功能 / P1 明显体验问题 / P2 优化项 / P3 建议项

---

## A. 风险与阻塞登记

| 编号 | 平台 | 问题描述 | 影响 | 优先级 | 状态 |
|---|---|---|---|---|---|
| R1 | Android | 正式 APK 签名证书是否已配置 GitHub Secrets 未知 | 无法产出生产升级包 | P0 | ⬜ 待确认 |
| R2 | Android | android-native README 自述 2.21.0/81 与 gradle 2.34.0/103 不一致 | 文档误导 | P3 | ⬜ 待修复 |
| R3 | 仓库 | android/ 与 mobile/ 旧目录滞留，易误开发 | 工程混淆 | P2 | ⬜ 待决策（标注或移除） |

---

## B. 历史遗留问题回归清单（总指令第六章，逐一真实验证）

| 编号 | 平台 | 页面/功能 | 问题描述 | 验证方式 | 优先级 | 状态 |
|---|---|---|---|---|---|---|
| H1 | Web | 文章详情 | 桌面端正文真实宽度（需 DOM 测量 1280/1440/1920 三视口） | 浏览器 DOM 实测 | P0 | ⚠️ 2.69.0 已修复代码并确认 CSS 产物，浏览器实测待用户验收 |
| H2 | Web | 翻卡 | 长时间停留『正在翻开』 | 代码审计 | P0 | ⚠️ 代码层已修复待浏览器实测：completeFlip 有 finally 兜底，无论成败均 setFlippingId(null)+释放 flipBusy；失败经 setFlipError 常驻展示，无永久卡死路径（Community.tsx:2743 finally 块） |
| H3 | Web | 翻卡 | 翻卡成功后卡片内容不显示 | 代码审计 | P0 | ⚠️ 代码层已修复待浏览器实测：成功路径写入 state.revealed 并 rarity→content 两相渲染；revealRepair 自愈机制（1256 行）检测 opened 但缺 revealed 的内容并修复；closeViewer 清理 rarity 定时器；reduced-motion 时 delay=0 |
| H4 | Web+APP | 图片 | 图片加载异常 | 代码审计 | P1 | ⚠️ 代码层已有多层兜底待实测：onError 回退 /image-not-loaded.svg、lazy/eager 按优先级、preview 防重复回退标记、decor 图标失败记录；未发现无兜底的裸 img（Community.tsx 4663/4666/6421/6752/6820） |
| H5 | Web | 卡片 | 展开后返回位置错误 | 代码审计 | P1 | ⚠️ 代码层已修复待实测：scrollPositions 按 tab 保存滚动位置、返回时 instant 恢复（Community.tsx:1024-1050），详情另有 scrollBeforeDetail ref；completeFlip 成功后 requestAnimationFrame 恢复 scrollBefore |
| H6 | Web | 正文 | 图片占位导致布局跳动 | 代码审计 | P1 | ⚠️ 代码层已防护待实测：卡片封面容器按来源设 aspectRatio 预留比例（own 3/4、discover discoverCoverRatio），加载完成前占位已定；reader.css 2.69.0 对 pre/code/table 限宽滚动 |
| H7 | Web | 个人主页 | 桌面适配不足 | 代码审计 | P1 | ⚠️ 待浏览器实测：存在独立 profile.css 与 public-profile.css，含桌面媒体查询；实际桌面布局效果需浏览器验收（与 2.69.0 待办合并） |
| H8 | Web | 发布页 | 桌面端放大单列表单 | 真实操作 | P0 | ⚠️ 2.69.0 双栏已上线，待浏览器验收 |
| H9 | Web | 发布页 | 附件区域与编辑器宽度不一致 | 真实操作 | P1 | ⚠️ 待浏览器验收 |
| H10 | Web | 草稿 | 自动恢复旧内容（违反空白初始化规则） | 代码审计 | P0 | ⚠️ 代码层已修复待浏览器实测：editor-session.ts 显式三分 CREATE/DRAFT_EDIT/POST_EDIT，文件头明言『普通发布入口永远是干净的新建会话』；openComposer CREATE 模式一律空白初始化，仅草稿箱主动选择才进 DRAFT_EDIT 恢复内容（Community.tsx:3477） |
| H11 | Web | 发布 | 重复发布错误 | 代码审计 | P0 | ⚠️ 代码层已修复待浏览器实测：publish-task-manager 以 taskKey 即 idempotency_key 镜像服务端 publish_tasks，同一发布重试复用键、内容变化生成新键，服务端据此去重；hashSnapshot 检测幂等键被复用到不同内容（publish-task-manager.ts:301-310） |
| H12 | Web | 发布 | 必须等待上传完成才能离开页面 | 代码审计 | P1 | ⚠️ 代码层已修复待浏览器实测：任务持久化 IndexedDB（heika-publish-tasks 库），PublishTaskManager 为单例独立于组件生命周期；ensureLoaded 在刷新后将进行中任务标 failed 并提示重发、同名图片复用已上传结果；高频 progress 仅内存不落库防拖慢主线程 |
| H13 | Web+APP | 聊天 | 未接通或多端状态不同步 | 代码审计 | P0 | ⚠️ 代码层已接通待双账号实测：/api/v1/messages 单协议 16+ 操作（open/send2/edit/recall/react/favorite/forward/mark_unread/request/privacy 等）+ dm_* RPC 族；Messages.tsx 订阅 heika-inbox-{uid} 频道监听 dm_messages postgres_changes，15s 轮询兜底，online/visibilitychange 恢复，贴底自动已读，非当前会话触发行内新消息通知；InboxBadge 经 heika-unread 频道同步未读数 |
| H14 | Web | 装扮 | 个人背景/装扮保存后失效 | 代码审计 | P1 | ⚠️ 代码层已接通待浏览器实测：/api/v1/decor/settings PATCH 真实持久化；保存后 dispatch heika-decor-updated 全局事件 + bridge 通知原生端；DecorCenter 有 savePhase 相位反馈（idle/dirty/done）；themes 收藏/安装走独立接口（decor/store.ts:158-169） |
| H15 | Admin | 管理后台 | 数据不实时或显示虚假状态 | 代码审计 | P1 | ⚠️ 代码层机制正确待实测：admin-live.ts 前端单例每 1s 拉 /api/v1/admin/realtime，标签页不可见暂停、可见即补，上次未完成不叠加，失败指数退避+抖动防轰炸；组件只订阅不自建计时器，切换页面不重建连接；数据源自 /api/v1/admin/realtime 服务端快照，非硬编码 |

---

## C. 本轮审计新发现（持续追加）

| 编号 | 平台 | 页面/功能 | 问题描述 | 根因 | 方案 | 优先级 | 状态 |
|---|---|---|---|---|---|---|---|
| （待审计填充） | | | | | | | |

---

## D. 已解决归档

| 编号 | 解决版本/提交 | 验证证据 |
|---|---|---|
| （待填充） | | |
