import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import type { SuggestionData } from "../api/client";

export function useLatestSuggestion() {
  const [data, setData] = useState<SuggestionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await api.getLatestSuggestion();
      setData(result);
    } catch (e: unknown) {
      if (e instanceof Error && e.message.includes("404")) {
        setData(null); // no suggestion yet — not an error
      } else {
        setError(e instanceof Error ? e.message : "Unknown error");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const generate = useCallback(async () => {
    try {
      setGenerating(true);
      setError(null);
      const result = await api.generateSuggestion();
      setData(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  return { data, loading, generating, error, refetch: fetch, generate };
}
