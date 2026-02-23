const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`HTTP ${res.status}: ${body?.detail || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  getLatestScores: () => request<ScoreData>("/scores/latest"),

  getScoreHistory: (days = 14) =>
    request<{ entries: ScoreData[] }>(`/scores/history?days=${days}`),

  getLatestSuggestion: () => request<SuggestionData>("/suggestions/latest"),

  generateSuggestion: () =>
    request<SuggestionData>("/suggestions/generate", { method: "POST", body: "{}" }),

  submitCheckin: (payload: CheckinPayload) =>
    request<CheckinResponse>("/checkin", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  uploadOura: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return request<UploadResponse>("/upload/oura", {
      method: "POST",
      body: fd,
      headers: {},
    });
  },

  uploadAppleHealth: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return request<UploadResponse>("/upload/apple-health", {
      method: "POST",
      body: fd,
      headers: {},
    });
  },
};

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ScoreData {
  date: string;
  recovery_score: number | null;
  exposure_score: number | null;
  friction_score: number | null;
  condition: string;
  computed_at: string;
}

export interface SuggestionData {
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
  date: string;
  friction_rating: number;
  note?: string;
}

export interface CheckinResponse {
  checkin_id: number;
  date: string;
  friction_rating: number;
  recorded_at: string;
}

export interface UploadResponse {
  message: string;
  rows_processed: number;
  date_range: { start: string; end: string };
}
