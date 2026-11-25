import type { Metadata } from "next";
import SeriesCoverEditor from "@/components/SeriesCoverEditor";

export const metadata: Metadata = {
  title: "封面设置 · HEIKA",
  robots: { index: false, follow: false },
};

/**
 * 合集封面编辑器。
 * 独立页面：APP 内嵌打开时不会带上网页的顶栏与底栏，
 * 只保留编辑器自己的「返回 / 标题 / 保存」三件套。
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SeriesCoverEditor seriesId={id} />;
}
