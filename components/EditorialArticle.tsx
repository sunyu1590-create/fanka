import type { Post } from "@/lib/content";
import { MarkdownContent } from "./MarkdownContent";

/** Desktop reading enhancements applied via CSS classes; no runtime JS needed. */
export default function EditorialArticle({ post }: { post: Post }) {
  return (
    <article className="editorial-article" data-content-type={post.contentType || "community_post"}>
      <MarkdownContent source={post.body} className="article-markdown" />
    </article>
  );
}
