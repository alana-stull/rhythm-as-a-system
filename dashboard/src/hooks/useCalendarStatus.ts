import { useCallback, useEffect, useState } from "react";

const API = "http://localhost:8000";

export interface CalendarStatus {
  connected: boolean;
  last_synced: string | null;
}

export function useCalendarStatus() {
  const [status, setStatus] = useState<CalendarStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const resp = await fetch(`${API}/calendar/status`);
      if (resp.ok) setStatus(await resp.json());
    } catch {
      // backend may not be running yet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();

    const params = new URLSearchParams(window.location.search);
    if (params.get("gcal") === "connected") {
      window.history.replaceState({}, "", window.location.pathname);
      fetchStatus();
    }
  }, [fetchStatus]);

  async function connect() {
    const resp = await fetch(`${API}/calendar/auth-url`);
    if (!resp.ok) return;
    const { url } = await resp.json();
    window.open(url, "_blank", "width=600,height=700");
  }

  async function sync() {
    setSyncing(true);
    try {
      await fetch(`${API}/calendar/sync`, { method: "POST" });
      await fetchStatus();
    } finally {
      setSyncing(false);
    }
  }

  async function disconnect() {
    await fetch(`${API}/calendar/disconnect`, { method: "DELETE" });
    setStatus({ connected: false, last_synced: null });
  }

  return { status, loading, syncing, connect, sync, disconnect };
}
