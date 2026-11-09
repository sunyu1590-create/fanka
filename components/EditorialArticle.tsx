import type { Post } from "@/lib/content";
import { MarkdownContent } from "./MarkdownContent";

export default function EditorialArticle({ post }: { post: Post }) {
  return <article className="editorial-article"><MarkdownContent source={post.body} className="article-markdown"/></article>;
}
