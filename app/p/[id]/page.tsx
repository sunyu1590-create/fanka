import type { Metadata } from "next";
import Community from "@/components/Community";

// 作品详情独立地址：/p/<客户端编号>。
// 这里只负责把地址里的编号传给客户端应用，真正的取数、鉴权与渲染仍走同一套业务组件，
// 因此刷新、复制链接、新标签页打开与浏览器前进后退都指向同一个稳定页面。
export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

const parseId = (raw: string) => {
  // 兼容 /p/123 与 /p/123-some-title 两种写法，只取开头的数字。
  const match = /^(\d{1,12})/.exec(decodeURIComponent(raw || ""));
  const value = match ? Number(match[1]) : Number.NaN;
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const clientId = parseId(id);
  return {
    title: clientId ? `作品 #${clientId} · HEIKA` : "作品详情 · HEIKA",
    description: "黑卡 HEIKA 作品详情：正文、图片、代码、附件与评论。",
  };
}

export default async function PostDetailPage({ params }: PageProps) {
  const { id } = await params;
  return <Community initialPostId={parseId(id)} detailPath={id} />;
}
