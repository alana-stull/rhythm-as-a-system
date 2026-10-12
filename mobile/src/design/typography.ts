import type { TextStyle } from "react-native";

// Families are registered in app/_layout.tsx under these exact keys.
export const fontFamily = {
  serif: "SourceSerif4_600SemiBold",
  serifMedium: "SourceSerif4_500Medium",
  sans: "DMSans_400Regular",
  sansMedium: "DMSans_500Medium",
  sansSemibold: "DMSans_600SemiBold",
  sansBold: "DMSans_700Bold",
} as const;

// The iOS boards draw a 390pt-wide phone at 9–14.5px. On a device those sizes
// read too small, so each role maps the mockup size up ~1.15x with a floor of
// 11pt. Every role scales with Dynamic Type; `maxScale` caps the multiplier for
// roles whose layout is tight (tab labels, tags, badges).
type Role = {
  style: TextStyle;
  maxScale: number;
  mockupPx: string; // provenance, for design review
};

export const type = {
  display:  { mockupPx: "32",   maxScale: 1.4, style: { fontFamily: fontFamily.serif, fontSize: 32, lineHeight: 38, letterSpacing: -0.3 } },
  title:    { mockupPx: "21–24",maxScale: 1.5, style: { fontFamily: fontFamily.serif, fontSize: 25, lineHeight: 31, letterSpacing: -0.2 } },
  question: { mockupPx: "19–21",maxScale: 1.6, style: { fontFamily: fontFamily.serif, fontSize: 22, lineHeight: 28 } },
  section:  { mockupPx: "14.5", maxScale: 1.6, style: { fontFamily: fontFamily.serif, fontSize: 17, lineHeight: 22 } },
  body:     { mockupPx: "12.5–13.5", maxScale: 2.0, style: { fontFamily: fontFamily.sans, fontSize: 15, lineHeight: 22 } },
  bodyStrong:{ mockupPx: "12–13.5", maxScale: 2.0, style: { fontFamily: fontFamily.sansSemibold, fontSize: 15, lineHeight: 22 } },
  button:   { mockupPx: "13.5–14", maxScale: 1.6, style: { fontFamily: fontFamily.sansMedium, fontSize: 16, lineHeight: 21 } },
  meta:     { mockupPx: "10–11.5", maxScale: 1.8, style: { fontFamily: fontFamily.sans, fontSize: 13, lineHeight: 18 } },
  metaStrong:{ mockupPx: "10.5–11.5", maxScale: 1.8, style: { fontFamily: fontFamily.sansMedium, fontSize: 13, lineHeight: 18 } },
  eyebrow:  { mockupPx: "10–10.5", maxScale: 1.5, style: { fontFamily: fontFamily.sansSemibold, fontSize: 12, lineHeight: 16, letterSpacing: 0.7, textTransform: "uppercase" } },
  badge:    { mockupPx: "13",   maxScale: 1.5, style: { fontFamily: fontFamily.sansSemibold, fontSize: 14, lineHeight: 18 } },
  tag:      { mockupPx: "9–11.5", maxScale: 1.4, style: { fontFamily: fontFamily.sansSemibold, fontSize: 12, lineHeight: 16 } },
  tab:      { mockupPx: "9.5",  maxScale: 1.3, style: { fontFamily: fontFamily.sansMedium, fontSize: 11, lineHeight: 14 } },
} satisfies Record<string, Role>;

export type TypeRole = keyof typeof type;
