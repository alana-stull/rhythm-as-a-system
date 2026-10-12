// "How you're doing" context: one sentence on *why* capacity looks the way it
// does. Every clause comes from a piece of evidence that exists; a missing
// signal is left out, never guessed. In F3 this sentence arrives from the
// backend (engine evidence + interpretation, with the deterministic fallback);
// this local version mirrors that contract for the P0 review.

export type CapacityEvidence = {
  sleep?: { quality: "well" | "okay" | "short"; source: "Oura" | "Apple Health" }; // wearable
  rested?: "very_low" | "low" | "moderate" | "high" | "very_high"; // check-in
  energy?: "very_low" | "low" | "moderate" | "high" | "very_high"; // check-in
  calendar?: { band: "light" | "moderate" | "heavy"; events: number }; // synced calendar
};

const RESTED: Record<NonNullable<CapacityEvidence["rested"]>, string> = {
  very_low: "not rested at all",
  low: "not very rested",
  moderate: "fairly rested",
  high: "well rested",
  very_high: "fully rested",
};
const ENERGY: Record<NonNullable<CapacityEvidence["energy"]>, string> = {
  very_low: "very low energy",
  low: "low energy",
  moderate: "moderate energy",
  high: "good energy",
  very_high: "lots of energy",
};
const SLEEP = { well: "You slept well", okay: "You slept okay", short: "You slept less than usual" } as const;
const CALENDAR = { light: "lighter", moderate: "steady", heavy: "full" } as const;
const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

function count(n: number, noun: string) {
  return `${WORDS[n] ?? n} ${noun}${n === 1 ? "" : "s"}`;
}

export function capacityContext(e: CapacityEvidence): string | null {
  // Capacity side: measured sleep and what the person reported. When both
  // exist, the person's report stays in (capacity follows the person).
  let capacity: string | null = null;
  if (e.sleep && e.rested) {
    // "but" when the two disagree; the disagreement is information, not noise.
    const feltGood = e.rested === "high" || e.rested === "very_high";
    const feltLow = e.rested === "low" || e.rested === "very_low";
    const disagree = (e.sleep.quality === "short" && feltGood) || (e.sleep.quality === "well" && feltLow);
    capacity = `${SLEEP[e.sleep.quality]} ${disagree ? "but" : "and"} said you're ${RESTED[e.rested]}`;
  } else if (e.sleep) {
    capacity = SLEEP[e.sleep.quality];
  } else if (e.rested && e.energy) {
    capacity = `You said you're ${RESTED[e.rested]}, with ${ENERGY[e.energy]}`;
  } else if (e.rested) {
    capacity = `You said you're ${RESTED[e.rested]}`;
  } else if (e.energy) {
    capacity = `You said you have ${ENERGY[e.energy]}`;
  }

  // Demand side: only from a synced calendar. An empty synced calendar is
  // stated as "nothing scheduled", not as a light day.
  let demand: string | null = null;
  if (e.calendar) {
    demand =
      e.calendar.events === 0
        ? "nothing is scheduled on your calendar"
        : `your schedule is ${CALENDAR[e.calendar.band]} today with ${count(e.calendar.events, "event")}`;
  }

  if (capacity && demand) return `${capacity}, and ${demand}.`;
  if (capacity) return `${capacity}.`;
  if (demand) return `${demand.charAt(0).toUpperCase()}${demand.slice(1)}.`;
  return null;
}
