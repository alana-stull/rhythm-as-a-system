// SDK 57: the classic API lives at expo-calendar/legacy and works in Expo Go
// (the new class-based API is a stub there).
import * as Calendar from "expo-calendar/legacy";
import * as Crypto from "expo-crypto";
import { useEffect, useState } from "react";
import { api } from "../api/http";

// Apple Calendar via EventKit (works in Expo Go). Privacy-first:
// - the server receives busy blocks only (times, all-day/free/declined flags)
//   with a hashed calendar ID; event titles never leave the phone;
// - the app shows titles by looking them up on the device.
// Recurring occurrences share an event ID, so each block's ID includes its start.

const PAST_DAYS = 1;
const FUTURE_DAYS = 14;

const titleCache = new Map<string, string>();
const blockId = (e: Calendar.Event) => `${e.id}@${new Date(e.startDate).toISOString()}`;

export type CalendarAccess = "granted" | "blocked" | "askable";

// Silent check: never shows a prompt. "blocked" means only iOS Settings can turn it back on.
export async function calendarAccess(): Promise<CalendarAccess> {
  const p = await Calendar.getCalendarPermissionsAsync();
  if (p.granted) return "granted";
  return p.canAskAgain ? "askable" : "blocked";
}

export async function calendarPermission(ask = false): Promise<boolean> {
  const current = await Calendar.getCalendarPermissionsAsync();
  if (current.granted || !ask || !current.canAskAgain) return current.granted;
  return (await Calendar.requestCalendarPermissionsAsync()).granted;
}

// null: the device has no calendars at all, which is "unknown", never "a free day".
async function eventsBetween(start: Date, end: Date): Promise<Calendar.Event[] | null> {
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  if (!calendars.length) return null;
  const events = await Calendar.getEventsAsync(calendars.map((c) => c.id), start, end);
  for (const e of events) titleCache.set(blockId(e), e.title);
  return events;
}

// The same meeting can sit in two calendars (say, a shared calendar and your own). Conservative: only events
// in *different* calendars with the exact same start, end, all-day flag and non-empty title are merged, so two
// distinct events are never folded together. The title is compared here on the phone and never sent.
function withoutCrossCalendarCopies(events: Calendar.Event[]): Calendar.Event[] {
  const seen = new Map<string, Calendar.Event>();
  const out: Calendar.Event[] = [];
  for (const e of events) {
    const title = e.title?.trim();
    const key = title ? [new Date(e.startDate).getTime(), new Date(e.endDate).getTime(), !!e.allDay, title].join("|") : null;
    const first = key ? seen.get(key) : undefined;
    if (first && first.calendarId !== e.calendarId) {
      // Keep one, and keep it busy if either copy is.
      if (e.availability !== Calendar.Availability.FREE) first.availability = e.availability;
      continue;
    }
    if (key && !first) seen.set(key, e);
    out.push(e);
  }
  return out;
}

// Your own response to a meeting, read on the device. Unknown stays "attending": we never guess a decline.
async function declinedByMe(e: Calendar.Event): Promise<boolean> {
  if (e.allDay) return false;
  try {
    const people = await Calendar.getAttendeesForEventAsync(e.id, { instanceStartDate: e.startDate });
    return people.some((p) => p.isCurrentUser && p.status === Calendar.AttendeeStatus.DECLINED);
  } catch {
    return false;
  }
}

const hash = (value: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value);

export type CalendarSync = { status: "synced"; events: number } | { status: "no_access" | "no_calendars" };

// Reads the device calendar and replaces the synced range on the server. Never prompts. A failed read throws
// (and uploads nothing), so a failure is never mistaken for an empty calendar.
// `asUser`: the account this read is for; the upload is refused if someone else has signed in meanwhile.
export async function syncCalendar(asUser?: string): Promise<CalendarSync> {
  if ((await calendarAccess()) !== "granted") return { status: "no_access" };
  const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - PAST_DAYS);
  const end = new Date(start); end.setDate(end.getDate() + PAST_DAYS + FUTURE_DAYS);
  const read = await eventsBetween(start, end);
  if (read === null) return { status: "no_calendars" };
  const events = withoutCrossCalendarCopies(read.filter((e) => e.status !== Calendar.EventStatus.CANCELED));

  const refs = new Map<string, string>();
  for (const id of new Set(events.map((e) => e.calendarId))) refs.set(id, (await hash(id)).slice(0, 32));
  const declined = await Promise.all(events.map(declinedByMe));

  const blocks = events.map((e, i) => ({
    external_id: blockId(e),
    calendar_ref: refs.get(e.calendarId)!,
    starts_at: new Date(e.startDate).toISOString(),
    ends_at: new Date(e.endDate).toISOString(),
    all_day: !!e.allDay,
    busy: e.availability !== Calendar.Availability.FREE,
    declined: declined[i],
  }));
  await api<{ days_written: number }>("/connections/apple-calendar/events", {
    method: "POST", asUser,
    json: { range_start: start.toISOString(), range_end: end.toISOString(), events: blocks },
  });
  return { status: "synced", events: blocks.length };
}

// Turned off in Rhythm, or access was revoked in iOS Settings: upcoming events are removed on the server
// (past days stay for Insights) and the calendar stops counting toward demand.
export const disconnectCalendar = (asUser?: string) => api<void>("/connections/apple-calendar", { method: "DELETE", asUser });

// Titles for synced events, resolved on the device (never from the server).
// Looks up whatever date range the given items span.
export function useEventTitles(items: { source: string; external_id: string | null; starts_at: string }[]) {
  const [titles, setTitles] = useState<Record<string, string>>({});
  const key = items.map((i) => i.external_id).join("|");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const synced = items.filter((i) => i.source === "apple_calendar" && i.external_id);
      if (!synced.length || !(await calendarPermission())) return;
      const ids = synced.map((i) => i.external_id!);
      if (ids.some((id) => !titleCache.has(id))) {
        const times = synced.map((i) => new Date(i.starts_at).getTime());
        const start = new Date(Math.min(...times)); start.setHours(0, 0, 0, 0);
        const end = new Date(Math.max(...times)); end.setHours(24, 0, 0, 0);
        await eventsBetween(start, end).catch(() => []);
      }
      if (!cancelled) setTitles(Object.fromEntries(ids.filter((id) => titleCache.has(id)).map((id) => [id, titleCache.get(id)!])));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return titles;
}
