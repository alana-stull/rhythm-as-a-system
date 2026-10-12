// SDK 57: the classic API lives at expo-calendar/legacy and works in Expo Go
// (the new class-based API is a stub there).
import * as Calendar from "expo-calendar/legacy";
import * as Crypto from "expo-crypto";
import { useEffect, useState } from "react";
import { api } from "../api/http";

// Apple Calendar via EventKit (works in Expo Go). Privacy-first:
// - the server receives busy blocks only (times, all-day/free flags) with a
//   hashed calendar ID; event titles never leave the phone;
// - the app shows titles by looking them up on the device.
// Recurring occurrences share an event ID, so each block's ID includes its start.

const PAST_DAYS = 1;
const FUTURE_DAYS = 14;

const titleCache = new Map<string, string>();
const blockId = (e: Calendar.Event) => `${e.id}@${new Date(e.startDate).toISOString()}`;

export async function calendarPermission(ask = false): Promise<boolean> {
  const current = await Calendar.getCalendarPermissionsAsync();
  if (current.granted || !ask) return current.granted;
  return (await Calendar.requestCalendarPermissionsAsync()).granted;
}

async function eventsBetween(start: Date, end: Date): Promise<Calendar.Event[]> {
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  if (!calendars.length) return [];
  const events = await Calendar.getEventsAsync(calendars.map((c) => c.id), start, end);
  for (const e of events) titleCache.set(blockId(e), e.title);
  return events;
}

const hash = (value: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value);

export async function syncCalendar(): Promise<number> {
  if (!(await calendarPermission())) return 0;
  const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - PAST_DAYS);
  const end = new Date(start); end.setDate(end.getDate() + PAST_DAYS + FUTURE_DAYS);
  const events = await eventsBetween(start, end);
  const refs = new Map<string, string>();
  for (const id of new Set(events.map((e) => e.calendarId))) refs.set(id, (await hash(id)).slice(0, 32));

  const blocks = events.map((e) => ({
    external_id: blockId(e),
    calendar_ref: refs.get(e.calendarId)!,
    starts_at: new Date(e.startDate).toISOString(),
    ends_at: new Date(e.endDate).toISOString(),
    all_day: !!e.allDay,
    busy: e.availability !== Calendar.Availability.FREE,
    declined: false, // EventKit doesn't expose the current user's response reliably; treated as attending
  }));
  const res = await api<{ days_written: number }>("/connections/apple-calendar/events", {
    method: "POST",
    json: { range_start: start.toISOString(), range_end: end.toISOString(), events: blocks },
  });
  return res.days_written;
}

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
