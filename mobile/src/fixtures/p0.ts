// P0 mock data, modelled on the iOS boards so the shell can be reviewed against
// them. Nothing here reaches the backend; screens switch to the API in F5.
import type { CapacityDisplay, Tag } from "../design";
import type { CapacityEvidence } from "../today/capacityContext";

export const tags: Record<string, Tag> = {
  work: { id: "tag-work", name: "Work", color: "sky" },
  school: { id: "tag-school", name: "School", color: "sage" },
  personal: { id: "tag-personal", name: "Personal", color: "blush" },
  health: { id: "tag-health", name: "Health", color: "seafoam" },
  side: { id: "tag-side", name: "Side project", color: "honey" },
};

// P0 review clock: the screen always depicts today at 1:15 PM (the afternoon
// the Today board shows), so the review looks the same at any hour.
export function mockNow(real: Date = new Date()) {
  const d = new Date(real);
  d.setHours(13, 15, 0, 0);
  return d;
}

export type MockEvent = { id: string; title: string; start: Date; end: Date; tag?: Tag };
export type MockPriority = { id: string; label: string; done: boolean };

// Today is built relative to `now` so events are always upcoming and nothing
// shows a stale status. The recommendation references a task by id, so it can
// disappear once that task is done, and its window is derived from the events.
export function mockToday(now: Date) {
  const t0 = new Date(now);
  t0.setSeconds(0, 0);
  t0.setMinutes(t0.getMinutes() < 30 ? 30 : 60); // next half hour
  const at = (hours: number) => new Date(t0.getTime() + hours * 3_600_000);

  const events: MockEvent[] = [
    { id: "e1", title: "Client call", start: at(0), end: at(0.5), tag: tags.work },
    { id: "e2", title: "Call mom", start: at(2.5), end: at(3), tag: tags.personal },
    { id: "e3", title: "Dinner with roommates", start: at(4), end: at(5.5) },
  ];

  const priorities: MockPriority[] = [
    { id: "p1", label: "Finish the reading response", done: false },
    { id: "p2", label: "Gym", done: false },
    { id: "p3", label: "Send client proposal", done: true },
  ];

  return {
    // Self-reported state: the evidence is a check-in plus the synced calendar.
    // No wearable is connected in this mock, so there is no sleep evidence.
    capacity: {
      state: "Balanced" as CapacityDisplay,
      source: "self-reported",
      evidence: {
        rested: "moderate",
        energy: "moderate",
        calendar: { band: "moderate", events: events.length },
      } satisfies CapacityEvidence,
    },
    recommendation: {
      taskId: "p2",
      deferredDays: 4,
      window: { start: events[0].end, end: events[1].start },
    },
    priorities,
    events,
  };
}
