// Run: node --experimental-strip-types src/auth/routing.check.ts
import { destination, resumeIndex } from "./routing.ts";

const cases: [boolean, boolean | undefined, string][] = [
  [false, undefined, "/sign-in"], [false, true, "/sign-in"],
  [true, undefined, "/onboarding"], [true, false, "/onboarding"], [true, true, "/today"],
];
for (const [signedIn, done, want] of cases) {
  const got = destination(signedIn, done);
  if (got !== want) throw new Error(`destination(${signedIn}, ${done}) = ${got}, want ${want}`);
}
for (const [saved, want] of [[null, 0], ["name", 0], ["dump", 4], ["capacity", 5], ["rested", 5], ["first_day", 7], ["bogus", 0]] as const) {
  if (resumeIndex(saved) !== want) throw new Error(`resumeIndex(${saved}) = ${resumeIndex(saved)}, want ${want}`);
}
console.log("routing checks passed");
