# PERFORMANCE_BASELINE · 性能测试基线

> 采集时间：2026-11-28 08:20–08:23 (Asia/Shanghai)
> 采集方式：docker stats / docker logs / psql 只读查询 / HTTP 探测
> 用途：阶段十性能优化前后的对比基准

---

## 1. 容器资源占用（docker stats --no-stream 快照）

| 容器 | CPU | 内存 | 内存限额占比 | 备注 |
|---|---|---|---|---|
| fanka | 0.05% | 146.3 MiB | 7.45% | Next.js 主应用 |
| fanka-ai-worker | 0.02% | 34.69 MiB | 1.77% | AI 任务工作器 |
| fanka-metrics | 0.13% | 55.12 MiB | 2.81% | 指标采集（旧镜像 d05390eeb0a0） |
| caddy | 0.00% | 34.38 MiB | 1.75% | 反代 |
| supabase-rest | 0.06% | 34.72 MiB | 27.12% (128M 限额) | |
| supabase-storage | 0.00% | 77.82 MiB | 40.53% (192M 限额) | 占比最高，需观察 |
| supabase-auth | 0.00% | 13.55 MiB | 10.58% (128M 限额) | |
| realtime | 0.19% | 56.98 MiB | 14.84% (384M 限额) | |
| supabase-db | 0.04% | 163.5 MiB | 25.55% (640M 限额) | |

总内存占用约 617 MiB / 1.918 GiB，余量充足。CPU 全部空闲水位。

---

## 2. 数据库规模基线（public schema，141 张表）

| 表 | 行数（估算） | 类别 |
|---|---|---|
| http_access_logs | 394,900 | 监控日志（最大表，阶段十需评估保留策略/分区） |
| tcp_snapshots | 20,266 | 监控 |
| system_metrics | 19,839 | 监控 |
| content_impressions | 633 | 业务行为 |
| media_traffic_path_daily | 626 | 监控 |
| ai_usage_events | 440 | AI 计量 |
| posts | 64 | 核心内容 |
| media_assets | 67 | 媒体 |
| dm_messages | 41 | 私信 |
| access_codes | 26 | 邀请码 |

业务数据规模小，当前性能问题不太可能来自数据量；http_access_logs 占绝对大头，是日志治理重点。

---

## 3. 任务队列状态

### ai_task_items
| status | count |
|---|---|
| completed | 161 |
| skipped | 25 |
| review | 5 |
| processing 卡死(>30min) | 0 |

> 5 条 review 状态：属正常人工复审队列，非异常；阶段七管理后台需确认其可见可处理。

### upload_tasks
| status | count |
|---|---|
| ready | 73 |

无失败/无积压。

---

## 4. 异常信号排查记录

| 信号 | 排查过程 | 结论 |
|---|---|---|
| 宿主 curl localhost:3000 返回 000 | docker port 显示 3000/tcp 未映射宿主（仅 expose，经 Caddy 内网转发） | ✅ 正常架构，非故障 |
| internal/health 返回 401 | 经 Caddy 内网探测，internal 路由需鉴权 | ✅ 鉴权生效，应用存活 |
| ai-worker 『request failed (TypeError)』 | 时间戳 2026-11-27T16:35:09.891Z，仅晚于容器启动 0.4s；近 1000 行日志仅此 1 次；重启计数 0；任务队列 0 卡死 | ✅ 启动瞬间应用未就绪的单次握手失败，非持续故障；登记为低优先级观察项 |

---

## 5. HTTP 可用性

| 探测 | 结果 |
|---|---|
| https://moonclean.shop | 200 |
| 容器内健康接口（经 Caddy 内网） | 401（鉴权正确拦截） |

---

## 6. 阶段十优化候选与已实施结果（2026-11-28 09:00 更新）

### P-1 http_access_logs 膨胀治理 —— 已实施并验证

根因定位（真实数据分析）：
- 该表 39.8 万行 / 131MB，占全库 180MB 的 73%；但时间跨度仅 4 天（11-25 至 11-28），日均约 10 万行——不是历史堆积，是采集源头问题。
- 近 24 小时 path 分布：claim_ai_task_item 34190 条（22.1%）+ claim_ai_revision_review 34190 条（22.1%）+ 监控自身查询（system_alerts/system_processes/system_metrics/http_access_logs/tcp_snapshots/heika_ip_stats_inc）约 28%。内部服务流量合计约 72%。

修复措施：
1. scripts/metrics-agent.mjs 新增 TELEMETRY_PATH 正则，访问日志写入守卫增加过滤：内部轮询 RPC 与监控自身查询只计入 IP 聚合，不写明细。
2. docker-compose.yml 的 metrics-agent 服务挂载 ./scripts/metrics-agent.mjs:/app/scripts/metrics-agent.mjs:ro，脚本以仓库版本为准。
3. 正则语义单测 12/12 通过（8 条内部路径被过滤、4 条业务路径保留）；node --check 语法校验通过。
4. 清理保留窗口外 telemetry 历史 139,158 行 + VACUUM FULL。

验证证据：
- 重启后近 60 秒：总日志 15 条，telemetry 泄漏 0 条。
- 表体积：131MB → 64MB；全库：180MB → 113MB（-37%）。
- logCursor 轮转保护确认：新文件从末尾开始，重启不回读历史，无双写风险。

### 其余候选

| # | 方向 | 依据 | 优先级 | 状态 |
|---|---|---|---|---|
| P-2 | supabase-storage 内存限额占比 40.5% | 接近半额 | P3 | 观察中 |
| P-3 | 慢查询审计（pg_stat_statements） | 阶段十执行 | P2 | 待执行 |
| P-4 | 预期效果 | 日增日志量预计下降 70%+，30 天保留窗口下稳态约 30MB 级 | — | 待观测 |

---

## 7. 对比方法约定

阶段十复测时使用相同命令采集：docker stats --no-stream、pg_stat_user_tables 行数、任务队列 GROUP BY、HTTP 状态码，逐项对比本基线。
