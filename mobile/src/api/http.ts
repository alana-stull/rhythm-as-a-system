import Constants from "expo-constants";
import { supabase } from "../lib/supabase";

// Backend base URL. EXPO_PUBLIC_API_URL wins; in development the Metro host is
// reused so a physical iPhone on the same Wi-Fi reaches the Mac.
function baseUrl(): string {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL.replace(/\/$/, "");
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  return host ? `http://${host}:8000` : "http://127.0.0.1:8000";
}

export const API_URL = baseUrl();

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Every request carries the current Supabase access token. A 401 means the
// session is gone server-side, so the app signs out locally.
export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ApiError(401, "Not signed in.");

  const { json, headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...rest,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    throw new ApiError(0, "Can't reach Rhythm right now. Check your connection.");
  }

  if (res.status === 401) {
    await supabase.auth.signOut();
    throw new ApiError(401, "Please sign in again.");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const detail = typeof body?.detail === "string" ? body.detail : "Something went wrong.";
    throw new ApiError(res.status, detail);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}
