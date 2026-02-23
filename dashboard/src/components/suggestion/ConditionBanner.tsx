import React from "react";
import { colors, radius } from "../../tokens/design";

type Condition = "Aligned" | "Balanced" | "Strained" | "Overloaded";

interface ConditionBannerProps {
  condition: Condition | string;
  date: string;
}

const descriptions: Record<string, string> = {
  Aligned:    "Well-recovered and ready for deep work.",
  Balanced:   "Sustainable pace, moderate load.",
  Strained:   "Low recovery — protect your energy today.",
  Overloaded: "High load relative to current capacity.",
};

export function ConditionBanner({ condition, date }: ConditionBannerProps) {
  const c = colors.condition[condition as Condition] ?? colors.condition.Balanced;
  const desc = descriptions[condition] ?? "";

  const formatted = new Date(date + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div style={{
      background: c.bg,
      borderRadius: radius.lg,
      padding: "20px 24px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 16,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          background: c.dot,
          flexShrink: 0,
          boxShadow: `0 0 0 3px ${c.dot}33`,
        }} />
        <div>
          <div style={{ fontWeight: 600, fontSize: 16, color: c.text, lineHeight: 1.2 }}>
            {condition}
          </div>
          <div style={{ fontSize: 13, color: c.text, opacity: 0.75, marginTop: 2 }}>
            {desc}
          </div>
        </div>
      </div>
      <div style={{ fontSize: 13, color: c.text, opacity: 0.6, whiteSpace: "nowrap" }}>
        {formatted}
      </div>
    </div>
  );
}
