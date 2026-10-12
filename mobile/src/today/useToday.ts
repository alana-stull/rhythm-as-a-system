import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { getToday, listAreas, type Area } from "../api/endpoints";
import type { Today } from "../api/types";

// GET /today, refreshed when Today regains focus or the app returns to the foreground.
export function useToday() {
  const [data, setData] = useState<Today | null>(null);
  const [areas, setAreas] = useState<Record<string, Area>>({});
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const inFlight = useRef(false);

  const load = useCallback(async (pull = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    if (pull) setRefreshing(true);
    try {
      const [today, tags] = await Promise.all([getToday(), listAreas()]);
      setData(today);
      setAreas(Object.fromEntries(tags.map((t) => [t.id, t])));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load today.");
    } finally {
      inFlight.current = false;
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => s === "active" && load());
    return () => sub.remove();
  }, [load]);

  return { data, setData, areas, error, refreshing, reload: load };
}
