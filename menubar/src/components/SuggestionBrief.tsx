import React from "react";

interface SuggestionBriefProps {
  reflection: string;
  bullets: string[];
}

export function SuggestionBrief({ reflection, bullets }: SuggestionBriefProps) {
  return (
    <div style={{ padding: "14px 16px 10px" }}>
      <p style={{
        margin: 0,
        fontSize: 13,
        lineHeight: 1.6,
        color: "#3A3A3A",
        fontStyle: "italic",
        fontWeight: 400,
      }}>
        {reflection}
      </p>
      {bullets.length > 0 && (
        <ul style={{ margin: "10px 0 0", padding: 0, listStyle: "none" }}>
          {bullets.map((b, i) => (
            <li key={i} style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              fontSize: 12,
              color: "#1A1A1A",
              fontWeight: 500,
              lineHeight: 1.5,
              marginBottom: i < bullets.length - 1 ? 6 : 0,
            }}>
              <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#ABABAB", marginTop: 6, flexShrink: 0 }} />
              {b}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
