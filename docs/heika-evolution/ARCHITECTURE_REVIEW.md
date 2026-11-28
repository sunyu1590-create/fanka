# ARCHITECTURE_REVIEW · 前后端、数据库与安全架构审查

> 审计时间：2026-11-28 09:00–09:10
> 范围：鉴权体系、数据库 RLS、密钥管理、日志架构

---

## 1. 管理端鉴权覆盖（97 路由验证）

| 守卫方式 | 路由数 | 实现 |
|---|---|---|
| requirePermission | 49 | lib/server/require-permission.ts：profiles.role → 权限矩阵，22 项细粒度权限，未授权 403 |
| requireAdmin | 43 | lib/server/require-admin.ts |
| context | 7 | 通用鉴权，叠加 access-control |
| **无守卫** | **0** | ✅ 全覆盖，无裸奔路由 |

权限矩阵：admin（22 项全量）/ content_manager（内容+AI+监控读）/ reviewer（内容审阅）。

---

## 2. 数据库 RLS 审计与加固

### 加固前（真实缺陷）
141 张表 → 6 张未启用 RLS，且 anon/authenticated 持有 SELECT/INSERT/UPDATE/DELETE/TRUNCATE 全权限：

| 表 | 风险 |
|---|---|
| admin_action_logs | 管理员审计日志可被任意匿名用户读取/篡改/清空 |
| search_events | 含 user_id 的用户搜索行为隐私数据 |
| distribution_config | 内容分发策略可被匿名改写 |
| distribution_config_history | 配置历史泄露 |
| content_hot | 热榜评分可被篡改 |
| ai_post_summaries_backup_1124 | 备份表完全暴露 |

### 加固措施（已执行并验证）

| 表 | RLS | 策略 | 权限收回 |
|---|---|---|---|
| content_hot | ✅ | SELECT 匿名可读（热度分数非敏感） | INSERT/UPDATE/DELETE/TRUNCATE |
| distribution_config | ✅ | SELECT 登录可读（推荐逻辑依赖） | 同上 |
| distribution_config_history | ✅ | SELECT 限 is_admin 或 policy.manage | 同上 |
| admin_action_logs | ✅ | INSERT 限 staff 且 actor_id=auth.uid()；SELECT 限 is_admin 或 logs.read | UPDATE/DELETE/TRUNCATE |
| search_events | ✅ | 无前端策略（默认拒绝），仅 service_role | ALL |
| ai_post_summaries_backup_1124 | ✅ | 无策略（默认拒绝） | ALL |

关键前提已验证：service_role 具备 BYPASSRLS；is_admin()/has_staff_permission() 为 SECURITY DEFINER 包装，策略内查询 profiles 不受其 RLS 影响。

### 代码侧配套改造
- lib/server/search.ts：getTrendingSearches 由用户态 client 改为 adminClient()（service_role），因 search_events 已对前端拒绝。

### 回归验证（真实 HTTP）
| 接口 | 结果 |
|---|---|
| /api/v1/search/trending | 200 |
| /api/v1/series/discover | 200 |
| /api/v1/posts?limit=3 | 200 |

---

## 3. 密钥与敏感文件

| 检查项 | 结论 |
|---|---|
| Git 跟踪的 env 文件 | 仅 .env.example（合规） |
| .env / .env.local / .env.pre-migration-* | 均被 .gitignore 覆盖（.env.* 规则命中验证通过） |
| *.bak 备份 | 已被 .gitignore 忽略 |

---

## 4. 日志与监控架构

- 链路：Caddy access.log（JSON，20MB 轮转/保留 5 份/72h）→ metrics-agent（15s 采集）→ PostgREST 批量写入。
- 已有保护：静态资源不写明细、logCursor 轮转保护（重启不回读历史）、30 天保留清理、tcp 24h / ip 聚合 180 天。
- 本轮新增：TELEMETRY_PATH 过滤内部轮询与监控自查询（详见 PERFORMANCE_BASELINE.md P-1）。

---

## 5. 遗留观察项

| # | 事项 | 优先级 | 状态 |
|---|---|---|---|
| S1 | 部分非敏感表（如 posts/profiles）GRANT 面较宽，依赖 RLS 策略约束 | P3 | 观察 |
| S2 | metrics-agent 以挂载方式运行脚本，镜像内副本可能滞后 | P3 | 已通过挂载解决 |
| S3 | 管理端 97 路由未做统一审计日志中间件（部分路由手写 insert） | P2 | 待评估 |
