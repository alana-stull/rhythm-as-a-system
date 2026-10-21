// Where a person belongs. Used by the access gate and the entry route so the
// two can never disagree: signed out → sign-in; signed in but onboarding not
// finished (new or partway through) → onboarding; finished → Today.
export type Destination = "/sign-in" | "/onboarding" | "/today";

export function destination(signedIn: boolean, onboardingCompleted: boolean | undefined): Destination {
  if (!signedIn) return "/sign-in";
  return onboardingCompleted ? "/today" : "/onboarding";
}

// Onboarding steps, in order. The profile stores the key of the step to resume at.
export const ONBOARDING_STEPS = [
  "name", "world", "days", "matters", "dump", "capacity", "connect", "first_day",
] as const;

// "rested" was its own step before capacity became one screen.
const RENAMED: Record<string, string> = { rested: "capacity" };

export function resumeIndex(saved: string | null | undefined): number {
  const key = RENAMED[saved ?? ""] ?? saved ?? "";
  const i = ONBOARDING_STEPS.indexOf(key as (typeof ONBOARDING_STEPS)[number]);
  return i < 0 ? 0 : i;
}
