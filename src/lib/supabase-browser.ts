"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for the browser. Use it ONLY for auth (sign in, sign up, sign out,
 * password reset). All data goes through our own /api routes, never Supabase tables directly.
 * The session is stored in cookies, so the middleware and API routes can read it.
 */
export function createSupabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
