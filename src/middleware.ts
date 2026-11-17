import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { dropMalformedAuthCookies } from "@/server/auth/cookies";
import { isProtectedPath, loginRedirect } from "@/server/auth/routes";

/**
 * Runs before every page:
 * 1. refreshes the Supabase login when its token has expired and passes the new cookies on, so
 *    server components always see a valid session;
 * 2. sends logged-out visitors from protected pages to the login page.
 * API routes are skipped (see `config.matcher`): they verify the login themselves with
 * `withUser` and answer 401 instead of redirecting.
 */
export async function middleware(request: NextRequest) {
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
  // Everything except API routes, Next internals and static files.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
