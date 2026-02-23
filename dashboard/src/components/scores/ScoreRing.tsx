import React from "react";

interface ScoreRingProps {
  value: number | null;
  color: string;
  label: string;
  size?: number;
  strokeWidth?: number;
}

export function ScoreRing({
  value,
  color,
  label,
  size = 88,
  strokeWidth = 7,
}: ScoreRingProps) {
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const pct = value != null ? Math.min(100, Math.max(0, value)) / 100 : 0;
  const offset = circumference * (1 - pct);
  const cx = size / 2;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
      {/* Ring + number */}
      <div style={{ position: "relative", width: size, height: size }}>
        <svg
          width={size}
          height={size}
          style={{ transform: "rotate(-90deg)", display: "block" }}
        >
          <circle cx={cx} cy={cx} r={r} fill="none" stroke="#EFEFEF" strokeWidth={strokeWidth} />
          <circle
            cx={cx}
            cy={cx}
            r={r}
            fill="none"
            stroke={value != null ? color : "#EFEFEF"}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.6s ease" }}
          />
        </svg>
        <div style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
          <span style={{
            fontSize: value != null ? 20 : 16,
            fontWeight: 600,
            color: value != null ? "#1A1A1A" : "#ABABAB",
            letterSpacing: "-0.5px",
          }}>
            {value != null ? Math.round(value) : "—"}
          </span>
        </div>
      </div>
      <span style={{ fontSize: 11, color: "#6B6B6B", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {label}
      </span>
    </div>
  );
}
