import { useCallback, useEffect, useState } from "react";

const API = "http://localhost:8000";

export interface OuraStatus {
  connected: boolean;
  last_synced: string | null;
}

export function useOuraStatus() {
  const [status, setStatus] = useState<OuraStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const resp = await fetch(`${API}/oura/status`);
      if (resp.ok) setStatus(await resp.json());
    } catch {
      // backend may not be running yet — silently ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();

    // If the user just completed OAuth, the URL will have ?oura=connected
    const params = new URLSearchParams(window.location.search);
    if (params.get("oura") === "connected") {
      // Clean URL without reload
      window.history.replaceState({}, "", window.location.pathname);
      fetchStatus();
    }
  }, [fetchStatus]);

  async function connect() {
    const resp = await fetch(`${API}/oura/auth-url`);
    if (!resp.ok) return;
    const { url } = await resp.json();
    window.open(url, "_blank", "width=600,height=700");
  }

  async function sync() {
    setSyncing(true);
    try {
      await fetch(`${API}/oura/sync`, { method: "POST" });
      await fetchStatus();
    } finally {
      setSyncing(false);
    }
  }

  async function disconnect() {
    await fetch(`${API}/oura/disconnect`, { method: "DELETE" });
    setStatus({ connected: false, last_synced: null });
  }

  return { status, loading, syncing, connect, sync, disconnect };
}
