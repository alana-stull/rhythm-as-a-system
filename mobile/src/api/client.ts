// ── Base URL ──────────────────────────────────────────────────────────────────
// In development, Expo tells us the dev-server host (your Mac's LAN IP).
// We reuse that host for the backend, so the same build works on simulators
// AND physical devices without any manual IP editing.
//
// Override at any time by setting EXPO_PUBLIC_API_URL in a .env file:
//   EXPO_PUBLIC_API_URL=http://192.168.1.42:8000
import Constants from "expo-constants";

function resolveBaseUrl(): string {
  // Explicit env override wins (production or custom dev setups)
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;

  if (__DEV__) {
    // expoConfig.hostUri looks like "192.168.1.42:8081"
    const hostUri = Constants.expoConfig?.hostUri;
    if (hostUri) {
      const host = hostUri.split(":")[0];
      return `http://${host}:8000`;
    }
    // Android emulator fallback
    return "http://10.0.2.2:8000";
  }

  return "http://localhost:8000";
}

export const BASE_URL = resolveBaseUrl();

// ── Types ─────────────────────────────────────────────────────────────────────
export interface DailyScore {
  date: string;               // "YYYY-MM-DD"
  recovery_score: number | null;
  exposure_score: number | null;
  friction_score: number | null;
  condition: string;          // "Aligned" | "Balanced" | "Strained" | "Overloaded"
  computed_at: string;        // ISO datetime
}

export interface Suggestion {
  suggestion_id: number;
  date: string;
  condition: string;
  recovery_score: number | null;
  exposure_score: number | null;
  friction_score: number | null;
  reflection: string;
  bullets: string[];
  generated_at: string;
}

export interface CheckinPayload {
  date?: string;              // defaults to today on server
  friction_rating: number;    // 1–10
  note?: string;
}

export interface CheckinResponse {
  checkin_id: number;
  date: string;
  friction_rating: number;
  recorded_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ── Scores ────────────────────────────────────────────────────────────────────
export function getLatestScores(): Promise<DailyScore> {
  return request<DailyScore>("/scores/latest");
}

export function getScoreHistory(days: number = 14): Promise<{ entries: DailyScore[] }> {
  return request<{ entries: DailyScore[] }>(`/scores/history?days=${days}`);
}

export function patchExposure(exposure: number): Promise<{ date: string; exposure_score: number; condition: string }> {
  return request("/scores/today/exposure", {
    method: "PATCH",
    body: JSON.stringify({ exposure }),
  });
}

// ── Suggestions ───────────────────────────────────────────────────────────────
export function getLatestSuggestion(): Promise<Suggestion> {
  return request<Suggestion>("/suggestions/latest");
}

export function generateSuggestion(): Promise<Suggestion> {
  return request<Suggestion>("/suggestions/generate", { method: "POST" });
}

// ── Check-in ──────────────────────────────────────────────────────────────────
export function submitCheckin(payload: CheckinPayload): Promise<CheckinResponse> {
  return request<CheckinResponse>("/checkin", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ── OAuth status ──────────────────────────────────────────────────────────────
export function getOuraStatus(): Promise<{ connected: boolean; last_synced: string | null }> {
  return request("/oura/status");
}

export function syncOura(days = 30): Promise<{ synced_days: number }> {
  return request(`/oura/sync?days=${days}`, { method: "POST" });
}
