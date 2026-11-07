const FEED_IMAGE_ORIGIN = "https://heika.invalid";

/** Build a cache-distinct, appropriately sized image URL for discovery cards. */
export function feedImageSource(source?: string | null): string | undefined {
  if (!source) return undefined;

  let url: URL;
  try {
    url = new URL(source, FEED_IMAGE_ORIGIN);
  } catch {
    return source;
  }

  if (url.origin === FEED_IMAGE_ORIGIN && url.pathname === "/api/v1/media" && url.searchParams.has("path")) {
    url.searchParams.set("redirect", "1");
    url.searchParams.set("variant", "feed");
    return `${url.pathname}${url.search}`;
  }

  if (url.hostname === "images.unsplash.com") {
    url.searchParams.set("w", "800");
    url.searchParams.set("q", "78");
    return url.href;
  }

  return source;
}
