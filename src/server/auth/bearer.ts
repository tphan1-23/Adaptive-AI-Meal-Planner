/**
 * Reads a Supabase access token from an `Authorization: Bearer <token>` header (used by the
 * Expo phone app, which has no browser cookies). Returns null when the header is absent or
 * malformed. The token itself is verified with Supabase in `requireUser`, never trusted here.
 */
export function extractBearerToken(header: string | null | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+([A-Za-z0-9._~+/-]+=*)$/i.exec(header.trim());
  // Real access tokens are JWTs (three dot-separated parts); reject anything else early.
  if (!match || match[1].split(".").length !== 3) return null;
  return match[1];
}
