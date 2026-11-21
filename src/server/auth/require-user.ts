import { createClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { extractBearerToken } from "./bearer";
import { createSupabaseServer } from "./supabase-server";

/** Throw from a service to answer with this status and message. `withUser` turns it into JSON. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
  }
}

/**
 * Returns the logged-in user's id (Profile.id) or throws UnauthorizedError.
 * Two ways to be logged in: the Supabase session cookie (web), or an
 * `Authorization: Bearer <access token>` header (the Expo phone app). Both are verified with
 * Supabase (`getUser`), never trusted from the client.
 */
export async function requireUser(): Promise<string> {
  try {
    const token = extractBearerToken(headers().get("authorization"));
    if (token) {
      const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data.user) throw new UnauthorizedError();
      return data.user.id;
    }
    const { data, error } = await createSupabaseServer().auth.getUser();
    if (error || !data.user) throw new UnauthorizedError();
    return data.user.id;
  } catch {
    // Any failure to read or verify the session means "not logged in", never a 500.
    throw new UnauthorizedError();
  }
}

/**
 * Wraps an API handler: injects the verified user id and maps auth failures to 401.
 * Every route must use this so it only ever touches the caller's own data.
 */
export function withUser<A extends unknown[]>(
  handler: (userId: string, ...args: A) => Promise<Response>,
) {
  return async (...args: A): Promise<Response> => {
    try {
      return await handler(await requireUser(), ...args);
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      if (e instanceof HttpError) {
        return NextResponse.json({ error: e.message }, { status: e.status });
      }
      throw e;
    }
  };
}
