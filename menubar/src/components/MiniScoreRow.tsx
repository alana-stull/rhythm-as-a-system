import React from "react";

interface MiniScoreRowProps {
  recovery: number | null;
  exposure: number | null;
}

export function MiniScoreRow({ recovery, exposure }: MiniScoreRowProps) {
  const scores = [
    { label: "Recovery", value: recovery, color: "#4CAF72" },
    { label: "Exposure", value: exposure, color: "#5B8DE8" },
  ];

  return (
    <div style={{
      display: "flex",
      justifyContent: "space-around",
      padding: "14px 20px",
      borderTop: "1px solid rgba(0,0,0,0.06)",
      borderBottom: "1px solid rgba(0,0,0,0.06)",
      background: "#FAFAF9",
    }}>
      {scores.map(({ label, value, color }) => (
        <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
          <span style={{ fontSize: 22, fontWeight: 600, color: value != null ? "#1A1A1A" : "#ABABAB", letterSpacing: "-0.5px" }}>
            {value != null ? Math.round(value) : "—"}
          </span>
          <span style={{ fontSize: 10, fontWeight: 500, color, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}
