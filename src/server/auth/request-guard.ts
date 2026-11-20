/** Largest JSON body an API route accepts. Our biggest real request is a few hundred bytes. */
export const MAX_API_BODY_BYTES = 100_000;

const BODY_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export interface GuardInput {
  method: string;
  /** Value of the Content-Length header, if any. */
  contentLength: string | null;
  transferEncoding: string | null;
  /** Value of the Origin header, if the browser sent one. */
  origin: string | null;
  /** Value of the Sec-Fetch-Site header ("same-origin", "same-site", "cross-site", "none"), if sent. */
  secFetchSite: string | null;
  /** The host this request was sent to, for example "localhost:3000". */
  host: string;
}

export interface Blocked {
  status: number;
  error: string;
}

/**
 * Cheap checks run on every API request before any route code, using only headers.
 *
 * 1. Cross-site requests that change data are refused. Login cookies are already SameSite=Lax,
 *    which stops browsers sending them on cross-site POSTs; this is a second layer that also
 *    covers old browsers and cookie-setting mistakes. Requests without an Origin header (scripts,
 *    tests, tools) pass: they cannot ride on a victim's browser cookies.
 * 2. Oversized bodies are refused (413). Validation libraries can use a lot of memory on huge
 *    inputs, so the cap is enforced before anything reads the body.
 *
 * Returns null when the request may continue.
 */
export function checkApiRequest(i: GuardInput): Blocked | null {
  if (!BODY_METHODS.has(i.method.toUpperCase())) return null;

  if (i.secFetchSite && i.secFetchSite.toLowerCase() === "cross-site") {
    return { status: 403, error: "Cross-site request blocked" };
  }
  if (i.origin) {
    let originHost: string | null = null;
    try {
      originHost = new URL(i.origin).host;
    } catch {
      originHost = null;
    }
    if (originHost !== i.host) return { status: 403, error: "Cross-site request blocked" };
  }

  if (i.contentLength !== null) {
    // Digits only: "", "-5", "1.5" and "abc" are all invalid.
    if (!/^\d+$/.test(i.contentLength.trim())) return { status: 400, error: "Invalid Content-Length" };
    if (Number(i.contentLength) > MAX_API_BODY_BYTES) return { status: 413, error: "Request body too large" };
  } else if (i.transferEncoding) {
    // A body of unknown length cannot be checked up front.
    return { status: 411, error: "Content-Length is required" };
  }
  return null;
}
