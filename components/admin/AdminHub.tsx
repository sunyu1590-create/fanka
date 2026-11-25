"use client";

import { ChevronRight } from "lucide-react";
import { ADMIN_HUB_GROUPS, ADMIN_TITLES, type AdminTab, Group } from "./AdminUIKit";

const DESCRIPTIONS: Record<string, string> = {
  "ai-review": "AI 初审、人工复审、历史与异常",
  content: "社区作品与修改版本复审",
  "decor-review": "创意工坊投稿复审",
  "ai-batch": "总结、审核与分类批量任务",
  "ai-classify": "分类建议与应用记录",
  monitor: "CPU、内存、磁盘与 API 性能",
  process: "宿主机进程与容器资源占用",
  tasks: "媒体、AI、扫描与发布任务",
  "media-service": "上传下载、流量与传输任务",
  storage: "容量分类、健康检查与热门资源",
  cost: "服务器、存储、流量与 AI 费用",
  alerts: "当前告警与历史记录",
  reports: "作品与评论举报",
  messages: "私信举报处理",
  appeals: "内容、账号与举报申诉",
  comments: "搜索、隐藏与恢复评论",
  keywords: "发布与互动拦截规则",
  users: "账号、角色与发言限制",
  membership: "卡密、权益与订单核验",
  "community-access": "认证标识与入驻邀请",
  "topic-events": "共创活动管理",
  "official-notices": "公告编辑与发送",
  "exploration-ad": "探索页顶部广告位",
  "ai-space": "资源审核与分类目录",
  "ai-resource-center": "批量审核与摘要任务",
  "ai-usage": "Token、费用与响应时间",
  "ai-settings": "模型与密钥配置",
  audit: "管理员操作历史",
  "app-download": "网页与 APP 版本信息",
  "home-banners": "首页图片与视频轮播、尺寸与运营数据",
  "cover-templates": "官方封面模板与历史补齐",
};

/** 一级导航的二级入口页：Apple Settings 式分组，一屏内完成选择。 */
export default function AdminHub({
  tab,
  counts,
  onNavigate,
}: {
  tab: Exclude<AdminTab, "overview">;
  counts: Partial<Record<string, number>>;
  onNavigate: (section: string) => void;
}) {
  return (
    <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 18 }}>
      {ADMIN_HUB_GROUPS[tab].map((group) => (
        <div key={group.title}>
          <div className="ab-section__head" style={{ padding: "0 4px", marginBottom: 8 }}>
            <h2 className="ab-section__title" style={{ fontSize: 13, color: "var(--ab-ink-3)", fontWeight: 600 }}>{group.title}</h2>
          </div>
          <Group>
            {group.items.map((key) => {
              const count = counts[key] || 0;
              return (
                <button key={key} type="button" className="ab-row" onClick={() => onNavigate(key)}>
                  <span className="ab-row__body">
                    <span className="ab-row__title">{ADMIN_TITLES[key] || key}</span>
                    <span className="ab-row__meta">{DESCRIPTIONS[key] || ""}</span>
                  </span>
                  {count > 0 ? <span className="ab-chip bad">{count}</span> : null}
                  <ChevronRight size={16} className="ab-row__chev" aria-hidden="true" />
                </button>
              );
            })}
          </Group>
        </div>
      ))}
    </div>
  );
}
