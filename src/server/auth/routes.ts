/** Pages that need a logged-in user. API routes check the login themselves (they answer 401). */
export const PROTECTED_PAGES = ["/dashboard", "/plan", "/today", "/recipes", "/shopping-list", "/onboarding"];

export const LOGIN_PATH = "/login";

/** True for a protected page or anything under it ("/recipes/abc"), but not look-alikes ("/planet"). */
export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Where to send a logged-out visitor: the login page, remembering where they were going.
 * The remembered path must be a same-site path, so it can never become an open redirect.
 */
export function loginRedirect(pathname: string, search = ""): string {
  const target = `${pathname}${search}`;
  const safe = target.startsWith("/") && !target.startsWith("//") && !target.includes("\\");
  return safe ? `${LOGIN_PATH}?next=${encodeURIComponent(target)}` : LOGIN_PATH;
}

/** Validates a `next` value from the login URL before redirecting to it after sign-in. */
export function safeNextPath(next: string | null | undefined, fallback = "/today"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  return next;
}
