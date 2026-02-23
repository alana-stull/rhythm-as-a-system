import React from "react";
import { RhythmData } from "../hooks/usePolling";
import { MiniScoreRow } from "./MiniScoreRow";
import { SuggestionBrief } from "./SuggestionBrief";

type Condition = "Aligned" | "Balanced" | "Strained" | "Overloaded";

const CONDITION_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  Aligned:    { bg: "#E8F5EC", text: "#2D6A42", dot: "#4CAF72" },
  Balanced:   { bg: "#EAF0FB", text: "#2B4A8A", dot: "#5B8DE8" },
  Strained:   { bg: "#FDF3E7", text: "#8A4E1A", dot: "#E08B3A" },
  Overloaded: { bg: "#FCEAEB", text: "#8A2030", dot: "#D94F5C" },
};

interface PopoverCardProps {
  data: RhythmData;
  lastUpdated: Date | null;
  error: string | null;
  loading: boolean;
  onRefresh: () => void;
}

export function PopoverCard({ data, lastUpdated, error, loading, onRefresh }: PopoverCardProps) {
  const condition = data.scores?.condition ?? "Balanced";
  const c = CONDITION_COLORS[condition] ?? CONDITION_COLORS.Balanced;

  const timeAgo = lastUpdated ? formatTimeAgo(lastUpdated) : null;

  if (loading) {
    return (
      <div style={{
        fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
        background: "#FFFFFF",
        padding: 24,
        textAlign: "center",
        color: "#ABABAB",
        fontSize: 13,
      }}>
        Loading…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
        background: "#FFFFFF",
        padding: "28px 24px",
        textAlign: "center",
      }}>
        <div style={{ fontSize: 13, color: "#D94F5C", marginBottom: 6, fontWeight: 500 }}>Backend offline</div>
        <div style={{ fontSize: 12, color: "#ABABAB" }}>Start the Rhythm server to see your data.</div>
      </div>
    );
  }

  return (
    <div style={{
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
      background: "#FFFFFF",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "14px 16px 12px",
        background: c.bg,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: c.dot,
            display: "block",
            boxShadow: `0 0 0 2px ${c.dot}33`,
          }} />
          <span style={{ fontWeight: 600, fontSize: 14, color: c.text }}>
            {condition}
          </span>
        </div>
        <span style={{ fontSize: 11, color: c.text, opacity: 0.5, fontWeight: 500, letterSpacing: "-0.2px" }}>
          rhythm
        </span>
      </div>

      {/* Scores */}
      <MiniScoreRow
        recovery={data.scores?.recovery_score ?? null}
        exposure={data.scores?.exposure_score ?? null}
      />

      {/* Suggestion */}
      {data.suggestion ? (
        <SuggestionBrief
          reflection={data.suggestion.reflection}
          bullets={data.suggestion.bullets}
        />
      ) : (
        <div style={{ padding: "16px 18px", fontSize: 13, color: "#ABABAB", fontStyle: "italic" }}>
          No suggestion yet — open Rhythm to generate one.
        </div>
      )}

      {/* Footer */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 16px 12px",
        borderTop: "1px solid rgba(0,0,0,0.06)",
      }}>
        <span style={{ fontSize: 11, color: "#ABABAB" }}>
          {timeAgo ? `Updated ${timeAgo}` : "—"}
        </span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={onRefresh}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 11,
              color: "#ABABAB",
              fontFamily: "inherit",
              padding: "2px 4px",
            }}
          >
            ↻ Refresh
          </button>
          <button
            onClick={() => window.open("http://localhost:5173", "_blank")}
            style={{
              background: "none",
              border: "1px solid rgba(0,0,0,0.1)",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 11,
              color: "#6B6B6B",
              fontFamily: "inherit",
              padding: "3px 10px",
              fontWeight: 500,
            }}
          >
            Open ↗
          </button>
        </div>
      </div>
    </div>
  );
}

function formatTimeAgo(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}
