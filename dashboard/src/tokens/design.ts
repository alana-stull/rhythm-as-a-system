export const colors = {
  bg: {
    primary: "#F9F9F7",
    surface: "#FFFFFF",
    overlay: "rgba(0, 0, 0, 0.04)",
  },
  text: {
    primary: "#1A1A1A",
    secondary: "#6B6B6B",
    muted: "#ABABAB",
    inverse: "#FFFFFF",
  },
  condition: {
    Aligned:    { bg: "#E8F5EC", text: "#2D6A42", dot: "#4CAF72" },
    Balanced:   { bg: "#EAF0FB", text: "#2B4A8A", dot: "#5B8DE8" },
    Strained:   { bg: "#FDF3E7", text: "#8A4E1A", dot: "#E08B3A" },
    Overloaded: { bg: "#FCEAEB", text: "#8A2030", dot: "#D94F5C" },
  },
  ring: {
    recovery:  "#4CAF72",
    exposure:  "#E08B3A",
    friction:  "#D94F5C",
    track:     "#EFEFEF",
  },
  border: "#E8E8E6",
  accent: "#1A1A1A",
} as const;

export const shadow = {
  card: "0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)",
  elevated: "0 4px 24px rgba(0,0,0,0.08)",
};

export const radius = {
  sm: "6px",
  md: "10px",
  lg: "16px",
  xl: "24px",
  full: "9999px",
};

export type Condition = keyof typeof colors.condition;
