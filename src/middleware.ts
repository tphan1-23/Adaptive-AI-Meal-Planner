import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { dropMalformedAuthCookies } from "@/server/auth/cookies";
import { checkApiRequest } from "@/server/auth/request-guard";
import { isProtectedPath, loginRedirect } from "@/server/auth/routes";

/**
 * Runs before every page and API request.
 *
 * API requests (`/api/*`): only the cheap header checks in `checkApiRequest` (cross-site changes
 * and oversized bodies are refused). The login itself is verified by each route with `withUser`,
 * which answers 401 instead of redirecting.
 *
 * Pages:
 * 1. refreshes the Supabase login when its token has expired and passes the new cookies on, so
 *    server components always see a valid session;
 * 2. sends logged-out visitors from protected pages to the login page.
 */
export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    const blocked = checkApiRequest({
      method: request.method,
      contentLength: request.headers.get("content-length"),
      transferEncoding: request.headers.get("transfer-encoding"),
      origin: request.headers.get("origin"),
      secFetchSite: request.headers.get("sec-fetch-site"),
      host: request.nextUrl.host,
    });
    return blocked ? NextResponse.json({ error: blocked.error }, { status: blocked.status }) : NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => dropMalformedAuthCookies(request.cookies.getAll()),
        setAll: (list: { name: string; value: string; options: CookieOptions }[]) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  let loggedIn = false;
  try {
    // getUser() checks the token with Supabase (unlike getSession(), which trusts the cookie).
    const { data } = await supabase.auth.getUser();
    loggedIn = Boolean(data.user);
  } catch {
    loggedIn = false;
  }

  const { pathname, search } = request.nextUrl;
  if (!loggedIn && isProtectedPath(pathname)) {
    return NextResponse.redirect(new URL(loginRedirect(pathname, search), request.url));
  }
  return response;
}

export const config = {
  // API routes (header checks only), and every page except Next internals and static files.
  matcher: [
    "/api/:path*",
    "/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
