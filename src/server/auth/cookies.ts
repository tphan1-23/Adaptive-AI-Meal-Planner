export interface CookieLike {
  name: string;
  value: string;
}

// Supabase stores the session as `sb-<ref>-auth-token`, split into `.0`, `.1`... chunks when large.
const AUTH_COOKIE = /^(sb-.+-auth-token)(?:\.(\d+))?$/;

/** True if the stored session is something Supabase can decode (plain JSON or "base64-" + JSON). */
function isReadableSession(value: string): boolean {
  try {
    const json = value.startsWith("base64-")
      ? new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(value.slice(7), "base64url"))
      : value;
    JSON.parse(json);
    return true;
  } catch {
    return false;
  }
}

/**
 * Removes Supabase auth cookies whose contents cannot be decoded. A forged or corrupted cookie
 * would otherwise make Supabase's own decoder throw in a background promise. Without a readable
 * session the request is simply treated as logged out (401).
 */
export function dropMalformedAuthCookies<T extends CookieLike>(all: T[]): T[] {
  const groups = new Map<string, { index: number; value: string }[]>();
  for (const c of all) {
    const m = AUTH_COOKIE.exec(c.name);
    if (!m) continue;
    const parts = groups.get(m[1]) ?? [];
    parts.push({ index: m[2] === undefined ? 0 : Number(m[2]), value: c.value });
    groups.set(m[1], parts);
  }

  const bad = new Set<string>();
  for (const [base, parts] of groups) {
    const joined = parts.sort((a, b) => a.index - b.index).map((p) => p.value).join("");
    if (!isReadableSession(joined)) bad.add(base);
  }
  return all.filter((c) => {
    const m = AUTH_COOKIE.exec(c.name);
    return !(m && bad.has(m[1]));
  });
}
