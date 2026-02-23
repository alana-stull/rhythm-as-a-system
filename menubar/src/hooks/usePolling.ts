import { useCallback, useEffect, useState } from "react";

const API_BASE = "http://localhost:8000";
const POLL_MS = 5 * 60 * 1000; // 5 minutes

export interface RhythmData {
  scores: {
    date: string;
    recovery_score: number | null;
    exposure_score: number | null;
    friction_score: number | null;
    condition: string;
  } | null;
  suggestion: {
    condition: string;
    reflection: string;
    bullets: string[];
    generated_at: string;
  } | null;
}

export function usePolling() {
  const [data, setData] = useState<RhythmData>({ scores: null, suggestion: null });
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [scoresRes, suggestionRes] = await Promise.allSettled([
        fetch(`${API_BASE}/scores/latest`),
        fetch(`${API_BASE}/suggestions/latest`),
      ]);

      const scores =
        scoresRes.status === "fulfilled" && scoresRes.value.ok
          ? await scoresRes.value.json()
          : null;

      const suggestion =
        suggestionRes.status === "fulfilled" && suggestionRes.value.ok
          ? await suggestionRes.value.json()
          : null;

      setData({ scores, suggestion });
      setLastUpdated(new Date());
      setError(null);
    } catch {
      setError("Cannot reach Rhythm — is the backend running?");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, POLL_MS);
    return () => clearInterval(id);
  }, [fetchData]);

  return { data, lastUpdated, error, loading, refetch: fetchData };
}
