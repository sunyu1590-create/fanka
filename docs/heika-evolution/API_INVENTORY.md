# API_INVENTORY · 完整接口清单及接入状态

> 建立时间：2026-11-28 08:24
> 来源：find app -name route.ts（200 个）+ HTTP 方法导出提取 + 引用交叉验证
> 状态图例：✅ 已验证接通 / 🤖 APP 专用 / ❓ 待深查 / 🗑 废弃候选

---

## 1. 总量与分组

| 分组 | 数量 | 说明 |
|---|---|---|
| 总计 | 200 | 含 app/dl/[file]/route.ts 下载路由 |
| api/v1/admin/* | 97 | 管理端 |
| api/v1/internal/* | 4 | ai-tasks/process, budget-check, health, metrics |
| 用户端及杂项 | 98 | api/v1/* 用户路由 + client-config, demo/cards, library-comments, dl/[file] |

原始清单（含每个路由的 HTTP 方法）：/tmp/api-inventory-raw.txt（服务器临时文件，正式版随阶段六归档）

---

## 2. 零引用候选交叉验证（第一轮结论）

对 Web 前端（components/app/lib/hooks/utils）零引用的 8 个接口，扩大至 android-native 源码验证：

| 接口 | Web 引用 | Android 引用 | 结论 |
|---|---|---|---|
| /api/v1/auth/bootstrap | 无 | AuthRepository.kt:172 | 🤖 APP 专用（登录引导） |
| /api/v1/me/avatar | 无 | android-native 1 处 | 🤖 APP 专用 |
| /api/v1/me/interactions | 无 | android-native 1 处 | 🤖 APP 专用 |
| /api/v1/me/library | 无 | HeikaRepository.kt:982 | 🤖 APP 专用（书架/收藏分页） |
| /api/v1/me/privacy | 无 | android-native 1 处 | 🤖 APP 专用 |
| /api/v1/deck/open | 无 | 无（mobile/src/app/(tabs)/home.tsx:117 调用） | 📱 遗留客户端（mobile/ Expo 工程）专用，非废弃；Web 端翻卡走 library-state action=flip |
| /api/v1/me/interests | 无 | 无（mobile/src/app/interests.tsx:40 调用） | 📱 遗留客户端专用，非废弃 |
| /api/v1/me/bookmarks | 无 | 无 | 🗑 已被 /api/v1/library-state action=bookmark 取代（mobile 未调用，仅 docs/api.md 留有文档）；建议观察后清理文档 |

> 重要方法论：直接路径 grep 会漏掉封装层间接调用（如 lib/ 内 fetchAPI 变量拼接），也会漏掉非 Web 端调用。阶段六深查结果：deck/open 与 me/interests 由 mobile/（Expo 遗留客户端）调用；me/bookmarks 已被 library-state 的 bookmark action 取代。**结论：200 个接口中无真正废弃的孤立接口，Web 端 library-state 是翻卡/收藏/草稿/发布的统一入口（action=flip/open/bookmark/draft/publish/delete/preferences/reset/view/complete/like/dismiss）。**

---

## 3. Web 前端 API 封装层（lib/ 关键文件）

| 文件 | 职责 |
|---|---|
| chat-api.ts | 聊天接口封装 |
| reauth-client.ts | 重新认证 |
| native-bridge.ts | 原生桥接 |
| cloud.ts | 云调用 |
| publish-task-manager.ts | 异步发布任务 |
| editor-session.ts | 创作会话 |
| local-drafts.ts / draft-files.ts | 草稿 |
| media-upload.ts / attachments.ts | 媒体上传 |
| recommendations.ts / feed-collection.ts / feed-images.ts | 信息流 |
| inbox-summary.ts / notifications.ts | 消息与通知 |
| progression.ts / daily.ts | 用户成长 |
| membership-codes.ts / membership-plans.ts | 会员 |
| admin-live.ts | 管理端实时 |
| 其余 60+ 工具/缓存/校验模块 | 见 lib/ 目录 |

---

## 4. 阶段六核对方法（预告）

1. 以 /tmp/api-inventory-raw.txt 为全集，逐路由标注：Web 调用点 / Android 调用点 / 双侧 / 零引用。
2. 零引用接口先查 lib/ 封装层（grep 路径片段），再查 android-native，最后才列废弃候选。
3. 反向核对：前端代码中出现的 /api/ 路径若不存在对应 route.ts，列为『界面有入口但接口缺失』候选（P0 级）。
4. 验证方式：真实 HTTP 请求比对请求参数、响应格式、数据库写入。
5. 目标产出：200 个接口全部带状态标注的最终清单，以及缺失/废弃接口处理决策。

---

## 5. 已确认事实摘要

- internal/health 经 Caddy 内网返回 401：鉴权中间件正确生效，internal 路由不暴露公网。
- 管理端 97 个路由覆盖面完整（access-codes / ai-space / ai-tasks / membership / moderation / nexus / home-banners / metrics 等）。
- 第一阶段未发现明显『接口大面积缺失』迹象；风险集中在少量零引用候选与前端-接口契约一致性，留待阶段六全量验证。
