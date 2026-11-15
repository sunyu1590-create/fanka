# HEIKA 全面迁腾讯云：Supabase / Vercel 残留盘点

盘点时间：2026-11-15 17:20
代码基线：`C:/Users/SunYu/WorkBuddy/Claw/fanka`（v3.0.0）
线上环境：CloudBase `heika-d6g93evt77a482544` / 云托管服务 `heika-web`

---

## 一、结论先说

**主体已经迁完了，现在是收尾阶段，不需要重构。**

- 数据读写：已走 CloudBase PostgreSQL（`/v1/rdb/rest`，PostgREST 兼容），不再是 Supabase 项目
- 身份认证：已换成 CloudBaseAuth 适配器
- 文件存储：已走 CloudBase `/v1/storages`（Supabase Storage 协议兼容层）
- 前端配置：`/api/client-config` 只下发腾讯云网关地址，不再下发 Supabase URL/Key

**真正还跟国外挂钩的只剩 4 件事：**

1. **Supabase 里的历史数据没搬**（69 张表 / 58 个 RPC / auth 用户 / 存储文件）——最重的一项
2. **moonclean.shop 还挂在 Vercel 上跑**（备用入口），`.vercel/project.json` 也在
3. **`@vercel/blob` 依赖还在**（AI 密钥存储的备用分支，默认不启用）
4. **安卓 APK 的域名白名单与文案还写死 moonclean.shop / vercel 域名**

---

## 二、已经跑在腾讯云上的能力（无需改动）

| 能力 | 实现方式 | 代码位置 |
|---|---|---|
| 服务端数据访问 | 用 `PostgrestClient` 指向 CloudBase 网关 | `lib/server/api.ts:13`、`lib/server/cb.ts:16` |
| 前端配置下发 | 只返回 `gateway`，不下发任何长期密钥 | `app/api/client-config/route.ts` |
| 浏览器端 DB 客户端 | 按 Supabase 调用形状拼装，实际指向 CloudBase | `lib/cb-db.ts:25-49` |
| 浏览器端认证 | CloudBaseAuth 适配 `auth` 接口 | `lib/cb-auth.ts`、`lib/browser-db.ts:20` |
| 存储 | CloudBase 存储兼容层 | `lib/cb-db.ts:34` |
| 身份映射 | `ensure_user_identity(p_sub)` RPC 把 CloudBase uid 映射为应用 uuid | `lib/server/api.ts:33`、`lib/server/cb.ts:47` |
| 容器运行时 | 云托管 `heika-web`（Next.js standalone + Dockerfile） | `Dockerfile`、`cloudbaserc.json` |

---

## 三、还挂着 Supabase 的地方（按严重程度）

### P0 · 历史数据仍在 Supabase（唯一的“真依赖”）

- 旧库：`sauknappipwkxloaovms.supabase.co`（新加坡区）
- 规模：**69 张表、58 个 RPC 函数**（`supabase/migrations/*.sql` 统计）
- 待搬内容：表数据 + `auth.users`（需经 `cloudbase_auth_bridge` 映射成应用 uuid）+ 存储对象
- ⚠️ **必须先确认一件事**：CloudBase 侧现在到底是「已导过数据」还是「只有表结构」。
  这个直接决定线上是正常服务还是空库。验证方式（有 `CLOUDBASE_APIKEY` 即可）：

  ```bash
  curl -s "https://heika-d6g93evt77a482544.api.tcloudbasegateway.com/v1/rdb/rest/posts?select=id&limit=1" \
    -H "Authorization: Bearer $CLOUDBASE_APIKEY"
  ```

  返回空数组 = 只有结构没数据；有记录 = 数据已导，只需做增量校验。

### P1 · 移动端 RN 工程（已实质失效）

- `mobile/`（Expo + React Native，v2.0.0）仍真实 `createClient()` 连 Supabase：`mobile/src/lib/mobile-api.tsx:2,31-46`
- 它向 `/api/client-config` 要 `url` + `key`，但该接口现在只返回 `gateway` → **登录会直接抛「账号服务暂不可用」**
- 默认 API 地址仍是 `https://moonclean.shop`（`:8`）
- 现状：安卓已是 WebView 混合版（`android/`，v3.x 走 `moonclean.shop`），RN 版属历史产物
- 处置建议：归档删除；若要保留，需把 `mobile-api.tsx` 改成 `cb-db.ts` 同款适配（工作量 ≈ 半天）

### P1 · `@vercel/blob` 依赖

- `lib/server/ai-store.ts:3` 顶部 `import { del, get, put } from "@vercel/blob"`
- 默认 `AI_SECRET_STORE=cloudbase`，走 CloudBase 私有 bucket `heika-private`；`blob` 分支只在手动切环境变量时启用
- 处置：删 import 与 `blobStore()` 分支、从 `package.json` 移除依赖；云托管里已注入的 `BLOB_READ_WRITE_TOKEN` 可一并撤销

### P1 · 安卓端写死的旧域名

| 位置 | 内容 |
|---|---|
| `android/app/build.gradle.kts:8` | `val webUri = URI("https://moonclean.shop/")` |
| `android/app/build.gradle.kts:23` | `WEB_APP_HOSTS = "moonclean.shop,www.moonclean.shop,fanka-two.vercel.app"` |
| `MainActivity.kt:1128` | 关于页文案「内容服务连接 moonclean.shop」 |

域名一换，白名单不改会导致 APK 把新域名当外链拦截（走系统浏览器），等于应用内功能全废。**换域名必须重打 APK。**

### P2 · 视频直传按 Supabase Storage 协议写死

- `lib/video-upload.ts:13-19`：tus 断点续传 endpoint 固定 `/storage/v1/upload/resumable`，并做 `.supabase.co → .storage.supabase.co` 域名改写
- 当前网关是 `*.tcloudbasegateway.com`，域名改写分支不会触发，但 endpoint 路径仍是 Supabase 形态
- 风险：CloudBase 兼容层是否支持 tus 续传未经实测；视频上限 50MB，大文件失败会卡在这
- 处置：实测一次 50MB 上传；不支持就退化成 `storage.from().upload()` 分片或直接走 COS SDK

### P2 · 测试与工程配置里的旧痕迹

- 6 个 e2e 用例 mock 了 `*.supabase.co` 与 `client-config` 的 `url/key`（`tests/e2e/*.spec.ts`），与当前接口不一致，跑起来会误导
- `package.json` devDependencies 仍含 `supabase` CLI；`supabase/config.toml` 有 40 处 Supabase 配置
- `cloudbase/migrations/` 有 75 个 `.sql`，但**内容是从 Supabase 迁移脚本原样复制的 PG 语法**，首行注释还写着 "Run with Supabase CLI" —— 需确认云端是否真按这些执行过，否则 schema 真源仍是 `supabase/migrations/`
- `.vercel/project.json`（projectId `prj_KSp5l...`）本地关联，删除前先确认 Vercel 侧是否还要留档

### 说明：不是问题但要知道的

`@supabase/postgrest-js`、`@supabase/storage-js`、`@supabase/supabase-js` 在 `app/`、`lib/`、`components/` 里的几十处引用，**几乎全是 `import type`**（纯类型），不发起任何网络请求。它们是“协议形状依赖”而非服务依赖——数据实际全在腾讯云。可选的洁癖式清理，收益仅为去混淆。

---

## 四、存储清单（CloudBase 侧需同名同权限）

| Bucket | 用途 | 访问方式 |
|---|---|---|
| `post-covers` | 帖子图片 + 缩略图 + 2x 图 | 签名 URL |
| `post-videos` | 帖子视频（≤50MB） | 签名 URL |
| `heika-avatars` | 用户头像 | 公开 URL |
| `heika-chat` | 私信图片 | 签名 URL（900s） |
| `user-feedback` | 意见反馈附件 | 签名 URL |
| `heika-private` | AI 密钥保险箱 | 仅服务端 |

---

## 五、功能缺口（迁移不解决，但要知道）

- **Realtime 已静默失效**：`db.channel()` 在 `lib/cb-db.ts:42` 返回 `noopChannel`。三处订阅（`Community.tsx:3858` 会员状态、`InboxBadge.tsx:54` 未读、`Messages.tsx:274` 会话流）都收不到推送。
- 目前靠轮询兜底：`InboxBadge.tsx:92` 每 12 秒刷新、`Messages.tsx:327` 定时拉取。体验是「有延迟但能用」。
- 若要真实时：CloudBase 侧走「云开发实时数据推送」，或换 WebSocket 自建。属新功能，非迁移项。

---

## 六、执行路线

### 阶段 0 · 先决校验（半天）
1. 查 CloudBase 库有无数据（上文的 curl）
2. 若两边都有数据，做 count 对比，列出差异表
3. 确认 `cloudbase/migrations` 是否已在云端执行过

### 阶段 1 · 数据搬迁（1-2 天）
1. Supabase 侧 `pg_dump --data-only` 导出 69 张表
2. 按 `cloudbase_auth_bridge` 规则迁移 `auth.users` → 应用 uuid
3. 导入 CloudBase PG，逐表 count 校验 + 随机抽样 20 条字段比对
4. 6 个 bucket 的对象搬运（可用 `rclone` / 脚本循环 `download→upload`），校验路径与 mime
5. 冒烟：注册/登录、发帖带图、评论、私信、会员兑换、后台审核

### 阶段 2 · 代码收尾（半天-1 天）
1. 删 `@vercel/blob` 与 `blobStore()`
2. 归档 `mobile/`（或改适配）
3. 清 `.vercel/`、移除 `supabase` CLI 依赖
4. 修 6 个 e2e mock 指向新网关
5. 可选：把 `import type { SupabaseClient }` 换成自建 `DbClient` 类型

### 阶段 3 · 域名与入口收敛（依赖备案，7-20 天）
1. `moonclean.shop` 完成 ICP 备案 → 解析到云托管 → 绑定自定义域名
2. 改 `build.gradle.kts` 的 `webUri` 与 `WEB_APP_HOSTS`，重打 APK
3. 关停 Vercel 项目，形成单点
4. 期间对外统一用 `heika-web-347874-5-1532707730.sh.run.tcloudbase.com`（注意会弹腾讯云测试域名风险提示页）

---

## 七、需要你拍板的三件事

1. **Supabase 那份数据要还是不要？** 要 → 走阶段 1；不要 → 清空后从种子重建，省 1-2 天
2. **`mobile/` RN 客户端还维护吗？** 不维护我直接归档
3. **`moonclean.shop` 走备案绑腾讯云，还是换个新域名备案？** 决定阶段 3 的排期
