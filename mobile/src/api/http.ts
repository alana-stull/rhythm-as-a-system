import Constants from "expo-constants";
import { isAuthApiError } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

// Backend base URL. EXPO_PUBLIC_API_URL wins (set per EAS environment for builds); in development the
// Metro host is reused so a physical iPhone on the same Wi-Fi reaches the Mac. Release builds never fall
// back to a local address and accept only https.
function baseUrl(): string {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL.replace(/\/$/, "");
  if (!__DEV__) return "";
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  return host ? `http://${host}:8000` : "http://127.0.0.1:8000";
}

export const API_URL = baseUrl();
export const apiConfigured = __DEV__ ? !!API_URL : API_URL.startsWith("https://");

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Every request carries the current Supabase access token. A 401 first gets one
// session refresh and retry; the app only signs out (on this device) when
// Supabase itself rejects the session. Network trouble never signs anyone out.
//
// `asUser`: for uploads of data read on the device (calendar, Apple Health) for one account. If a different
// account is signed in by the time the upload is sent, it's refused rather than filed under the wrong person.
export async function api<T>(path: string, init: RequestInit & { json?: unknown; asUser?: string } = {}): Promise<T> {
  if (!apiConfigured) throw new ApiError(0, "This build of Rhythm isn't connected to a server.");
  const { data } = await supabase.auth.getSession();
  let token = data.session?.access_token;
  if (!token) throw new ApiError(401, "Not signed in.");
  if (init.asUser && data.session?.user.id !== init.asUser) throw new ApiError(409, "The signed-in account changed.");

  let res = await send(path, init, token);
  if (res.status === 401) {
    const { data: refreshed, error } = await supabase.auth.refreshSession();
    if (refreshed.session) {
      token = refreshed.session.access_token;
      res = await send(path, init, token);
    } else if (error && !isAuthApiError(error)) {
      throw new ApiError(0, "Can't reach Rhythm right now. Check your connection.");
    }
  }
  if (res.status === 401) {
    await supabase.auth.signOut({ scope: "local" });
    throw new ApiError(401, "Please sign in again.");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const detail = typeof body?.detail === "string" ? body.detail : "Something went wrong.";
    throw new ApiError(res.status, detail);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

async function send(path: string, init: RequestInit & { json?: unknown; asUser?: string }, token: string): Promise<Response> {
  const { json, headers, asUser: _asUser, ...rest } = init;
  try {
    return await fetch(`${API_URL}${path}`, {
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
}
