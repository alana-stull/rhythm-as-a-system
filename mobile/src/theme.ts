import { Platform } from "react-native";

// ── Colors ─────────────────────────────────────────────────────────────────
export const colors = {
  bg: {
    primary: "#F2F0EB",   // warm off-white — user-specified mobile bg
    surface: "#FFFFFF",
    card: "#FFFFFF",
  },
  text: {
    primary: "#1A1A1A",
    secondary: "#6B6B6B",
    muted: "#ABABAB",
    faint: "#C8C8C4",
    inverse: "#FFFFFF",
  },
  condition: {
    Aligned:    { bg: "#E8F5EC", text: "#2D6A42", dot: "#4CAF72" },
    Balanced:   { bg: "#EAF0FB", text: "#2B4A8A", dot: "#5B8DE8" },
    Strained:   { bg: "#FDF3E7", text: "#8A4E1A", dot: "#E08B3A" },
    Overloaded: { bg: "#FCEAEB", text: "#8A2030", dot: "#D94F5C" },
  } as Record<string, { bg: string; text: string; dot: string }>,
  ring: {
    recovery: "#4CAF72",
    exposure: "#E08B3A",
    friction: "#D94F5C",
    track:    "#EFEFEF",
  },
  border: "rgba(0, 0, 0, 0.08)",   // 0.5px-ish border on white card
  divider: "rgba(0, 0, 0, 0.06)",
  accent: "#1A1A1A",
} as const;

// ── Typography ──────────────────────────────────────────────────────────────
export const font = {
  family: Platform.select({ ios: "System", android: "sans-serif" }),

  size: {
    micro:   10,   // uppercase section labels
    tiny:    11,
    xs:      12,
    sm:      13,
    base:    14,
    md:      15,
    lg:      16,
    xl:      18,
    heading: 22,
    title:   24,
    display: 40,   // big metric numbers
  },

  weight: {
    light:    "300" as const,
    regular:  "400" as const,
    medium:   "500" as const,
    semibold: "600" as const,
    bold:     "700" as const,
  },

  letterSpacing: {
    tight:  -0.5,
    normal:  0,
    wide:    0.8,
    wider:   1.0,
  },
} as const;

// ── Spacing ─────────────────────────────────────────────────────────────────
export const space = {
  1:  2,
  2:  4,
  3:  6,
  4:  8,
  5:  10,
  6:  12,
  7:  14,
  8:  16,
  10: 20,
  12: 24,
  14: 28,
  16: 32,
  20: 40,
  24: 48,
} as const;

// ── Border radius ─────────────────────────────────────────────────────────────
export const radius = {
  sm:   6,
  md:   10,
  lg:   16,
  xl:   24,
  full: 9999,
} as const;

// ── Shadows ───────────────────────────────────────────────────────────────────
export const shadow = {
  card: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  elevated: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.09,
    shadowRadius: 14,
    elevation: 6,
  },
} as const;

// ── Card base ─────────────────────────────────────────────────────────────────
export const cardBase = {
  backgroundColor: colors.bg.card,
  borderRadius: radius.lg,
  borderWidth: 0.5,
  borderColor: colors.border,
  ...shadow.card,
} as const;
