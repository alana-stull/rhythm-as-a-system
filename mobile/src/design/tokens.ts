// Rhythm design tokens. Source of truth: "Rhythm product mockups" HTML (v7 iOS
// boards, mobile/assets; earlier Foundations board for type and tags). Values are copied from the mockups; the
// only deliberate departures are contrast fixes, marked "a11y" below.

// ── Color ─────────────────────────────────────────────────────────────────────
export const color = {
  cream: "#FAF8F4",       // app background (v7 "ivory")
  surface: "#FDFCFA",     // cards, inputs (v7 "card")
  white: "#FFFFFF",       // option rows, selected segment, synced events
  ink: "#1B1B1D",         // text. Not a fill: dark surfaces are cacao.

  // v7: chocolate for feature cards, primary buttons and selected controls.
  cacao: "#30251F",
  cacaoPress: "#241A15",
  cacaoDisabled: "rgba(48,37,31,0.38)",
  caramel: "#E4B780",     // the one action color on cacao ("Add to my plan")
  onCacao: "#FAF8F4",
  onCacaoMuted: "rgba(250,248,244,0.72)",
  tint: "#F3F0E8",        // quiet inner surfaces (segment track, chart wells)
  planned: "#F7EFE3",     // Rhythm-planned work in Plan (synced events stay white)
  plannedBorder: "rgba(184,119,42,0.24)",
  muted: "#6B6259",       // secondary text, inactive icons
  amber: "#B8772A",       // accent fills, icons, active tab, checked controls
  amberText: "#9C6524",   // a11y: amber for text (#B8772A is 3.5:1 on cream)
  amberLight: "#E8C99A",  // highlights on ink, open-window outlines
  amberSoft: "rgba(184,119,42,0.10)",
  onInk: "#FAF8F4",       // text on cacao (kept name: "on dark")
  onInkMuted: "rgba(250,248,244,0.72)", // v7 value; 0.72 on cacao is well above 4.5:1

  // Brand palette (Foundations). Reserved for brand moments, never tags or states.
  maroon: "#5C2331",
  evergreen: "#2F4438",
  navy: "#22314A",
  sage: "#4A6B4D",

  hairline: "rgba(27,27,29,0.08)",    // card borders, dividers
  border: "rgba(27,27,29,0.12)",      // inputs
  borderStrong: "rgba(27,27,29,0.22)",// secondary buttons, unchecked controls
  dashed: "rgba(27,27,29,0.25)",      // "no data yet" outlines
  disabled: "rgba(27,27,29,0.35)",
  scrim: "rgba(27,27,29,0.32)",
  fillMuted: "#F0ECE3",     // light neutral fill, distinct from cream (secondary actions)
  segmentTrack: "#F0ECE3",
  divider: "rgba(27,27,29,0.08)",   // between list rows (v7 lists sit on the page, not in cards)
  sheetHandle: "rgba(27,27,29,0.18)",

  conflict: "rgba(168,82,75,0.06)",
  conflictBorder: "rgba(168,82,75,0.30)",
} as const;

// ── Capacity states ───────────────────────────────────────────────────────────
// Engine outcomes: `assessed` (one of four states), `uncertain` (evidence fits
// more than one state) and `insufficient_evidence`. Each badge always carries a
// word and a source label, so color is never the only signal.
export type AssessedState = "Aligned" | "Balanced" | "Strained" | "Overloaded";
export type CapacityDisplay = AssessedState | "Uncertain" | "Insufficient";

export const stateColor: Record<CapacityDisplay, { base: string; text: string; soft: string }> = {
  Aligned:      { base: "#6B8F5E", text: "#3F5736", soft: "rgba(107,143,94,0.14)" },
  Balanced:     { base: "#5B7C99", text: "#35495C", soft: "rgba(91,124,153,0.14)" },
  Strained:     { base: "#C99A3B", text: "#7A5E1D", soft: "rgba(201,154,59,0.16)" },
  Overloaded:   { base: "#A8524B", text: "#6B2F2A", soft: "rgba(168,82,75,0.14)" },
  Uncertain:    { base: "#938C7F", text: "#5E584D", soft: "rgba(147,140,127,0.14)" },
  Insufficient: { base: "#938C7F", text: "#5E584D", soft: "transparent" },
};

// ── Tag pastels ───────────────────────────────────────────────────────────────
// People name their own tags and pick one of these. The key is what gets stored
// in `areas.color_family`.
export type PastelKey = "clay" | "honey" | "sage" | "sky" | "lilac" | "blush" | "stone" | "seafoam";

export const pastel: Record<PastelKey, { label: string; bg: string; text: string }> = {
  clay:    { label: "Clay",      bg: "#F3DCC9", text: "#865733" }, // a11y: was #8A5A35 (4.42:1)
  honey:   { label: "Honey",     bg: "#F5E3B3", text: "#7B601B" }, // a11y: was #8C6D1F (3.82:1)
  sage:    { label: "Sage mist", bg: "#DCE8D7", text: "#4F6B4A" },
  sky:     { label: "Sky",       bg: "#D9E4EE", text: "#3F5C78" },
  lilac:   { label: "Lilac",     bg: "#E6DCEE", text: "#6B4F7D" },
  blush:   { label: "Blush",     bg: "#F3DCE1", text: "#8A4A5C" },
  stone:   { label: "Stone",     bg: "#E2E0D5", text: "#5E5B4A" },
  seafoam: { label: "Seafoam",   bg: "#D7E8E4", text: "#3F6B63" },
};

export const pastelKeys = Object.keys(pastel) as PastelKey[];

// ── Spacing ───────────────────────────────────────────────────────────────────
export const space = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  gutter: 20, // screen side padding (iOS boards)
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

// ── Radius ────────────────────────────────────────────────────────────────────
// Tags are rounded rectangles; pills are reserved for capacity-state badges.
export const radius = {
  tag: 7,
  control: 10,
  option: 12,
  button: 13,
  card: 15,
  sheet: 24,
  pill: 999,
} as const;

// Cards sit on a hairline with no shadow; shadow is only for sheets and the FAB.
export const elevation = {
  sheet: {
    shadowColor: "#1B1B1D",
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 16,
  },
  fab: {
    shadowColor: "#1B1B1D",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
  },
} as const;

export const minTouch = 44; // Apple HIG minimum hit target
