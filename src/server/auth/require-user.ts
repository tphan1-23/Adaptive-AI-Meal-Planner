import { NextResponse } from "next/server";
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

/** Returns the logged-in user's id (Profile.id) or throws UnauthorizedError. */
export async function requireUser(): Promise<string> {
  try {
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
