import { NextResponse } from "next/server";
import { createSupabaseServer } from "./supabase-server";

export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
  }
}

/** Returns the logged-in user's id (Profile.id) or throws UnauthorizedError. */
export async function requireUser(): Promise<string> {
  const { data, error } = await createSupabaseServer().auth.getUser();
  if (error || !data.user) throw new UnauthorizedError();
  return data.user.id;
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
      throw e;
    }
  };
}
