import { createClient } from "@supabase/supabase-js";

/**
 * Supabase client with the service-role key. SERVER ONLY: it bypasses row-level security, so it is used for
 * the few things a user cannot do themselves (deleting their own login). Never import it from client code and
 * never expose this key through a NEXT_PUBLIC_ variable.
 */
export function createSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase admin credentials are not configured");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Checks an email and password pair with Supabase, without creating a session anywhere. */
export async function passwordIsCorrect(email: string, password: string): Promise<boolean> {
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  return !error && !!data.session;
}
