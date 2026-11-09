const APP_ORIGIN = "https://heika.invalid";

/** Select a small, feed-only image URL without changing detail-page sources. */
export function feedImageSource(source?: string | null): string | undefined {
  if (!source) return undefined;

  let url: URL;
  try {
    url = new URL(source, APP_ORIGIN);
  } catch {
    return source;
  }

  if (url.origin === APP_ORIGIN && url.pathname === "/api/v1/media" && url.searchParams.has("path")) {
    url.searchParams.set("redirect", "1");
    url.searchParams.set("variant", "feed");
    return `${url.pathname}${url.search}`;
  }

  if (url.hostname === "images.unsplash.com") {
    url.searchParams.set("auto", "format");
    url.searchParams.set("w", "640");
    url.searchParams.set("q", "76");
    return url.href;
  }

  return source;
}
