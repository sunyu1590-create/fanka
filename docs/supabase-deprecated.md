# Supabase 弃用声明

> 状态：**已弃用（Do Not Use）**
> 生效日期：2026-11-23
> 适用范围：网页端、Android 端、部署流程、新增功能与技术选型

## 一、结论

黑卡项目**不再使用 Supabase**，包括且不限于：

- Supabase 云服务（`*.supabase.co`、`supabase.com` 控制台、云端 Auth / Storage / Realtime / Edge Functions）；
- 新增任何以 Supabase SDK（`@supabase/*`、`supabase-js`、`supabase-kotlin`）为入口的功能；
- 在新的部署流程、CI、迁移脚本中引入 Supabase CLI 或 Supabase 托管实例；
- 在任何新文档、示例、脚手架中把 Supabase 作为推荐方案。

后续涉及数据库、鉴权、对象存储、实时能力的需求，**不得**再以 Supabase 为默认答案，必须先给出替代方案并经确认。

## 二、现状（必须如实了解，不要误读）

当前生产环境仍在运行的，是 2026-11-23 迁移到腾讯云的自建容器组（`/srv/heika-supabase` + `/home/ubuntu/fanka/docker-compose.yml`），包含 Postgres、Auth、PostgREST、storage-api 四个容器。

也就是说：

- **代码里仍然存在 `supabase/migrations/`、`@supabase/supabase-js`、GoTrue 登录接口、PostgREST 风格查询**——这些是历史遗留，不是"推荐继续使用"；
- 这些组件**不再接受新增功能**，只做维持性修复；
- 任何"再上一套 Supabase"、"开个 Supabase 项目"、"用 Supabase Storage 存一下"的提议，一律不采纳。

## 三、对已交付功能的影响

2026-11-23 这一轮把 APP 内嵌网页的登录方式从"共享 Supabase 会话令牌"改成了**网页内独立登录**（`components/AppLoginGate.tsx`），原因正是两边共用 `refresh_token` 在轮换机制下会互相作废。这一改动减少了对该套 Auth 的跨端耦合，方向与弃用一致。

## 四、迁移边界（待排期，不阻塞当前交付）

彻底移除需要分三块独立立项，不能混在 UI 迭代里做：

| 模块 | 现状 | 替换方向（待确认） |
| --- | --- | --- |
| 数据库 | Postgres 17 容器 | 可保留 Postgres，改用自有迁移与访问层 |
| 鉴权 | GoTrue（`/auth/v1`） | 自有会话服务（JWT + 刷新令牌） |
| 对象存储 | storage-api（`/storage/v1`） | 自有上传服务或对象存储直传 |
| 数据接口 | PostgREST 风格 | 自有 `/api/v1` 路由（已存在，逐步收口） |

在上述替换完成前，现有接口保持可用，但**不再扩展**。

## 五、执行约束

1. 新增代码不得 import `@supabase/*`；
2. 新增接口不得走 `/auth/v1`、`/rest/v1`、`/storage/v1` 的 Supabase 语义；
3. 部署脚本不得再调用 Supabase CLI；
4. 文档、注释、提交信息中不再把 Supabase 描述为"当前方案"或"推荐方案"；
5. 发现违反以上约束的改动，按缺陷处理。
