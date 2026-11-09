const DEFAULT_AUTH_REDIRECT_ORIGIN = "https://moonclean.shop";

/**
 * Auth emails must return to a publicly reachable site. Do not derive this
 * from window.location.origin: signups made from localhost would otherwise
 * produce confirmation links that cannot be opened on a user's phone.
 */
export function authRedirectUrl(path = "/") {
  const configured = process.env.NEXT_PUBLIC_AUTH_REDIRECT_URL?.trim();
  let origin = DEFAULT_AUTH_REDIRECT_ORIGIN;
  if (configured) {
    try {
      const candidate = new URL(configured);
      const localHost = ["localhost", "127.0.0.1", "::1"].includes(candidate.hostname);
      const secureOrigin = candidate.protocol === "https:" ||
        (process.env.NODE_ENV !== "production" && candidate.protocol === "http:" && localHost);
      if (secureOrigin && !(process.env.NODE_ENV === "production" && localHost)) origin = candidate.origin;
    } catch {
      // Keep auth links usable if an optional environment override is malformed.
    }
  }
  const base = `${origin}/`;
  return new URL(path, base).toString();
}
