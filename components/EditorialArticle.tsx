import type { Post } from "@/lib/content";
export default function EditorialArticle({ post }: { post: Post }) {
  const paragraphs = post.body
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  return (
    <article className="editorial-article">
      <p className="article-intro">{paragraphs[0]}</p>
      {paragraphs.length > 1 && (
        <>
          <div className="eyebrow">READING / 01</div>
          <h2>展开阅读</h2>
          <div className="article-sections">
            {paragraphs.slice(1).map((text, index) => (
              <section key={index}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <p>{text}</p>
              </section>
            ))}
          </div>
        </>
      )}
    </article>
  );
}
