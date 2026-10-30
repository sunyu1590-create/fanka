# 方卡 FANKA

移动端优先的兴趣内容社区原型。当前可运行的是**演示模式**：30 篇原创演示内容、每日五张卡、换卡、发现筛选与搜索、内容详情、收藏、评分、评论、回复、发布文字内容、兴趣与个人记录。数据只保存在当前浏览器的 `localStorage` 中；清除浏览器数据会删除记录。演示模式没有真实身份验证、公共内容发布、服务端每日限制或跨设备同步。

## 快速体验（无需登录或配置 Supabase）

当前网站默认运行在浏览器演示模式，不需要账号、密钥或数据库。兴趣设置可以跳过；收藏、评论和发布内容只保存在当前浏览器中。

在包含 `package.json` 的 Fanka 项目根目录运行。若使用 VS Code 远程环境，可直接用 3001 端口：

```bash
npm ci
npm run dev:3001
```

随后在 VS Code 的“端口”面板打开 3001。若要使用默认端口 3000，则运行 `npm run dev`。

## 本地启动

需要 Node.js 20.9+。请确认当前目录能看到 `package.json`，否则先切换到 Fanka 项目根目录。在本仓库运行：

```bash
npm ci
npm run dev
```

打开 `http://localhost:3000`。验证：`npm test && npm run typecheck && npm run build`。

## 技术结构

- Next.js App Router、React 19、TypeScript、原生 CSS；`app/` 是路由与设计样式，`components/Community.tsx` 实现演示交互，`lib/content.ts` 提供演示内容和确定性卡组。
- `supabase/migrations/` 定义 PostgreSQL 表、RLS、每日卡组 RPC、私有图片桶、写入限制和演示内容种子；`app/api/v1/` 是服务端接口。接口清单和部署步骤见 [docs/api.md](docs/api.md)。迁移尚未在远程项目运行，前端演示页尚未接入这些接口。
- 演示内容使用文字与色块封面，没有外部素材或虚构互动数据。

## 正式部署前需要完成

创建 Supabase 项目，在服务端配置 `SUPABASE_URL` 和 `SUPABASE_ANON_KEY`，应用迁移，再配置 Auth。每日卡组生成、翻卡和换卡已写为数据库 RPC；生产前仍须在真实项目验证权限、时区、并发和上传。随后把浏览器演示状态替换为经授权的 API 请求。应先完成这些步骤，才向真实用户开放注册与内容发布。绝不能把 service role key 放进浏览器。

## 当前限制

API 已有图片上传、评论、举报与管理员处理路由，但前端尚未接入。真实账号 UI、管理员界面、完整推荐排序、正式项目的数据库迁移验证与端到端权限测试尚未完成。当前界面仅用于交互与视觉体验。
