import { getConnections, ouraSync } from "../api/endpoints";
import { supabase } from "../lib/supabase";
import { calendarAccess, disconnectCalendar, syncCalendar } from "./calendar";
import { healthAvailable, syncHealth } from "./healthkit";

// Keeps connected services current without anyone tapping "Sync": runs on launch, when the app returns to the
// foreground, and when Today or Plan comes into focus (at most every two minutes unless forced).
//
// Rules:
// - Never prompts. Permissions are checked silently; only the Connect buttons ever ask.
// - Only services the person connected are synced.
// - A failure (offline, Oura down) leaves the connection as it is; the server records it as delayed and the
//   next run retries. Nothing is disconnected and no failure is uploaded as "no events" or "no data".
// - The one exception is calendar access turned off in iOS Settings: that's a real revocation, so the server
//   is told, and upcoming events stop showing and counting.

const MIN_GAP_MS = 2 * 60 * 1000;
let last = 0;
let running: Promise<boolean> | null = null;

const quietly = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return true;
  } catch {
    return false;
  }
};

async function run(): Promise<boolean> {
  // Device data is read for this account; if another account signs in mid-sync, its uploads are refused.
  const me = (await supabase.auth.getSession()).data.session?.user.id;
  if (!me) return false;
  const rows = Object.fromEntries((await getConnections()).map((c) => [c.provider, c]));
  const on = (p: string) => !!rows[p] && rows[p].state !== "off" && rows[p].state !== "unavailable";
  const jobs: Promise<boolean>[] = [];

  if (on("apple_calendar")) {
    jobs.push(quietly(async () => {
      if ((await calendarAccess()) === "granted") await syncCalendar(me);
      else await disconnectCalendar(me);
    }));
  }
  // HealthKit doesn't reveal whether read access was granted; a sync without access just finds no samples
  // and writes nothing, so it can't erase or invent readings.
  if (on("apple_health") && healthAvailable()) jobs.push(quietly(() => syncHealth(7, me)));
  // "expired" needs the person to reconnect; retrying would only fail again.
  if (on("oura") && rows.oura.state !== "expired") jobs.push(quietly(() => ouraSync()));

  return (await Promise.all(jobs)).some(Boolean);
}

// Resolves to true if anything synced. Concurrent callers share one run.
export function syncConnected(force = false): Promise<boolean> {
  if (running) return running;
  if (!force && Date.now() - last < MIN_GAP_MS) return Promise.resolve(false);
  last = Date.now();
  running = run().catch(() => false).finally(() => { running = null; });
  return running;
}

// Waits for a sync, but no longer than `ms`, so a slow network never holds a screen hostage. `later` runs if the
// sync finishes after the wait, so the screen can reload with fresh data.
export async function syncThen(ms: number, later: () => void, force = false): Promise<void> {
  const sync = syncConnected(force);
  const inTime = await Promise.race([sync.then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), ms))]);
  if (!inTime) sync.then((changed) => { if (changed) later(); });
}

// After signing out, the next person on this phone starts with a fresh sync.
export function resetAutoSync() {
  last = 0;
}
