import React from "react";
import type { SuggestionData } from "../../api/client";
import { radius, shadow } from "../../tokens/design";

interface SuggestionCardProps {
  suggestion: SuggestionData | null;
  generating: boolean;
  onGenerate: () => void;
  error?: string | null;
}

export function SuggestionCard({ suggestion, generating, onGenerate, error }: SuggestionCardProps) {
  const timeAgo = suggestion
    ? formatTimeAgo(new Date(suggestion.generated_at))
    : null;

  return (
    <div style={{
      background: "#FFFFFF",
      borderRadius: radius.lg,
      boxShadow: shadow.card,
      padding: "28px 28px 20px",
    }}>
      {suggestion ? (
        <>
          <p style={{
            fontSize: 16,
            lineHeight: 1.7,
            color: "#3A3A3A",
            fontStyle: "italic",
            fontWeight: 400,
            margin: 0,
          }}>
            {suggestion.reflection}
          </p>

          {suggestion.bullets.length > 0 && (
            <ul style={{ margin: "20px 0 0", padding: 0, listStyle: "none" }}>
              {suggestion.bullets.map((bullet, i) => (
                <li key={i} style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  fontSize: 14,
                  color: "#1A1A1A",
                  fontWeight: 500,
                  lineHeight: 1.5,
                  marginBottom: i < suggestion.bullets.length - 1 ? 10 : 0,
                }}>
                  <span style={{
                    width: 5,
                    height: 5,
                    borderRadius: "50%",
                    background: "#ABABAB",
                    marginTop: 8,
                    flexShrink: 0,
                  }} />
                  {bullet}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p style={{ fontSize: 15, color: "#ABABAB", margin: 0, lineHeight: 1.6 }}>
          {error
            ? "Could not load suggestion — check your data or API key."
            : "No suggestion yet. Upload wearable data and generate one."}
        </p>
      )}

      {/* Footer */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginTop: 24,
        paddingTop: 16,
        borderTop: "1px solid #F0F0EE",
      }}>
        <span style={{ fontSize: 12, color: "#ABABAB" }}>
          {timeAgo ? `Updated ${timeAgo}` : "No suggestion yet"}
        </span>
        <button
          onClick={onGenerate}
          disabled={generating}
          style={{
            background: "none",
            border: "1.5px solid #E8E8E6",
            borderRadius: "8px",
            padding: "7px 16px",
            fontSize: 13,
            fontWeight: 500,
            color: generating ? "#ABABAB" : "#1A1A1A",
            cursor: generating ? "wait" : "pointer",
            transition: "all 0.15s ease",
            fontFamily: "inherit",
          }}
        >
          {generating ? "Generating…" : suggestion ? "Regenerate" : "Generate"}
        </button>
      </div>
    </div>
  );
}

function formatTimeAgo(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
