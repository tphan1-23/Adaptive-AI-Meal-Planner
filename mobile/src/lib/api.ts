import { supabase } from "./supabase";

// Where the Next.js API runs: your computer's LAN address in dev (see .env.example), the deployed URL later.
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Calls our own /api routes with the Supabase access token as a Bearer token. */
export async function api<T>(path: string, init: { method?: string; json?: unknown } = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000); // AI calls can take 5 to 25 seconds
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: init.method ?? (init.json !== undefined ? "POST" : "GET"),
      headers: {
        ...(init.json !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
      signal: controller.signal,
    });
  } catch (e) {
    throw new ApiError(0, (e as Error).name === "AbortError" ? "The request took too long. Try again." : "Can't reach the server. Check your connection and API address.");
  } finally {
    clearTimeout(timer);
  }

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401) await supabase.auth.signOut(); // session expired: the root layout sends us to login
    throw new ApiError(res.status, body?.error ?? `Request failed (${res.status})`);
  }
  return body as T;
}
