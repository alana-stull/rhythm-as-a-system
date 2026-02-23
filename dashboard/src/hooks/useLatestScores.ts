import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import type { ScoreData } from "../api/client";

export function useLatestScores(refreshKey?: string | null) {
  const [data, setData] = useState<ScoreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await api.getLatestScores();
      setData(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch, refreshKey]);

  return { data, loading, error, refetch: fetch };
}
