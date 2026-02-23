import React, { useState } from "react";
import { useScoreHistory } from "../hooks/useScoreHistory";
import type { ScoreData } from "../api/client";

const WINDOWS = [7, 14, 30] as const;
type Window = typeof WINDOWS[number];

const CONDITION_COLORS: Record<string, { bg: string; text: string }> = {
  Aligned:    { bg: "#E8F5EC", text: "#2D6A42" },
  Balanced:   { bg: "#EAF0FB", text: "#2B4A8A" },
  Strained:   { bg: "#FDF3E7", text: "#8A4E1A" },
  Overloaded: { bg: "#FDE8E8", text: "#8A1A1A" },
};

function conditionColors(condition: string): { bg: string; text: string } {
  return CONDITION_COLORS[condition] ?? { bg: "#F0F0EE", text: "#6B6B6B" };
}

function calcStreak(data: ScoreData[]): number {
  if (!data.length) return 0;
  const sorted = [...data].sort((a, b) => b.date.localeCompare(a.date));
  let streak = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1].date + "T12:00:00");
    const curr = new Date(sorted[i].date + "T12:00:00");
    const diff = Math.round((prev.getTime() - curr.getTime()) / 86400000);
    if (diff === 1) streak++;
    else break;
  }
  return streak;
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const card: React.CSSProperties = {
  background: "rgba(255,255,255,0.65)",
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.07)",
  boxShadow: "0 1px 3px rgba(0,0,0,0.05), 0 4px 16px rgba(0,0,0,0.03)",
};

export function HistoryPage({ refreshKey }: { refreshKey?: string | null }) {
  const [days, setDays] = useState<Window>(14);
  const { data, loading } = useScoreHistory(days, refreshKey);
  const [selectedEntry, setSelectedEntry] = useState<ScoreData | null>(null);

  const recoveryValues = data.map(e => e.recovery_score ?? 0).filter(v => v > 0);
  const avgRecovery = recoveryValues.length
    ? Math.round(recoveryValues.reduce((a, b) => a + b, 0) / recoveryValues.length)
    : null;
  const peakRecovery = recoveryValues.length ? Math.max(...recoveryValues) : null;
  const streak = calcStreak(data);

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "32px 24px 80px" }}>

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 500, color: "#1A1A1A", letterSpacing: "-0.01em" }}>
            History
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#8A8A8A" }}>
            Track your rhythm over time
          </p>
        </div>

        {/* Window selector */}
        <div style={{ display: "flex", gap: 2, background: "#F0F0EE", borderRadius: 999, padding: 3 }}>
          {WINDOWS.map(w => (
            <button
              key={w}
              onClick={() => setDays(w)}
              style={{
                background: days === w ? "#FFFFFF" : "none",
                border: "none",
                borderRadius: 999,
                padding: "5px 12px",
                fontSize: 13,
                fontWeight: days === w ? 500 : 400,
                color: days === w ? "#1A1A1A" : "#6B6B6B",
                cursor: "pointer",
                fontFamily: "inherit",
                boxShadow: days === w ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                transition: "all 0.15s ease",
              }}
            >
              {w}d
            </button>
          ))}
        </div>
      </div>

      {/* ── Summary stats ────────────────────────────────────────────────── */}
      {!loading && data.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
          <div style={{ ...card, padding: "16px 18px" }}>
            <p style={{ margin: "0 0 8px", fontSize: 10, fontWeight: 600, color: "#ABABAB", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Avg Recovery
            </p>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
              <span style={{ fontSize: 30, fontWeight: 300, color: "#1A1A1A", letterSpacing: "-0.02em" }}>
                {avgRecovery ?? "—"}
              </span>
              <span style={{ fontSize: 12, color: "#ABABAB" }}>/100</span>
            </div>
          </div>

          <div style={{ ...card, padding: "16px 18px" }}>
            <p style={{ margin: "0 0 8px", fontSize: 10, fontWeight: 600, color: "#ABABAB", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Streak
            </p>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
              <span style={{ fontSize: 30, fontWeight: 300, color: "#1A1A1A", letterSpacing: "-0.02em" }}>
                {streak}
              </span>
              <span style={{ fontSize: 12, color: "#ABABAB" }}>days</span>
            </div>
          </div>

          <div style={{ ...card, padding: "16px 18px" }}>
            <p style={{ margin: "0 0 8px", fontSize: 10, fontWeight: 600, color: "#ABABAB", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Peak Recovery
            </p>
            <span style={{ fontSize: 30, fontWeight: 300, color: "#1A1A1A", letterSpacing: "-0.02em" }}>
              {peakRecovery ?? "—"}
            </span>
          </div>
        </div>
      )}

      {/* ── History list ─────────────────────────────────────────────────── */}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} style={{ ...card, height: 76, animation: "pulse 1.5s ease infinite" }} />
          ))}
        </div>
      ) : data.length === 0 ? (
        <div style={{ ...card, padding: "48px 24px", textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 14, color: "#ABABAB", lineHeight: 1.6 }}>
            No history yet.{" "}
            <span style={{ color: "#8A8A8A" }}>
              Sync your Oura ring or import data to see your rhythm over time.
            </span>
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[...data].reverse().map(entry => {
            const colors = conditionColors(entry.condition);
            return (
              <button
                key={entry.date}
                onClick={() => setSelectedEntry(entry)}
                style={{
                  ...card,
                  padding: "16px 18px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 16,
                  cursor: "pointer",
                  textAlign: "left",
                  width: "100%",
                  fontFamily: "inherit",
                  transition: "box-shadow 0.15s ease",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 500, color: "#1A1A1A" }}>
                      {fmtDate(entry.date)}
                    </span>
                    <span style={{
                      padding: "2px 10px",
                      borderRadius: 999,
                      background: colors.bg,
                      fontSize: 12,
                      fontWeight: 600,
                      color: colors.text,
                    }}>
                      {entry.condition}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 14 }}>
                    <ScoreBit label="Recovery" value={entry.recovery_score} />
                    {entry.exposure_score !== null && (
                      <ScoreBit label="Exposure" value={entry.exposure_score} />
                    )}
                  </div>
                </div>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                  <path d="M2 7H12M8 3L12 7L8 11" stroke="#D8D8D4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Detail modal ─────────────────────────────────────────────────── */}
      {selectedEntry && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setSelectedEntry(null); }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div style={{
            background: "#FFFFFF",
            borderRadius: 20,
            maxWidth: 440,
            width: "100%",
            padding: 24,
            boxShadow: "0 25px 60px rgba(0,0,0,0.2)",
            animation: "fadeIn 0.2s ease",
          }}>
            {/* Modal header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 500, color: "#1A1A1A" }}>
                {fmtDate(selectedEntry.date)}
              </h3>
              <button
                onClick={() => setSelectedEntry(null)}
                style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: "#F4F4F2", border: "none", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 20, color: "#6B6B6B", fontFamily: "inherit", lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>

            {/* Condition badge */}
            {(() => {
              const colors = conditionColors(selectedEntry.condition);
              return (
                <div style={{
                  background: "linear-gradient(135deg, #F9F9F7 0%, #FFFFFF 100%)",
                  borderRadius: 12,
                  padding: 20,
                  border: "1px solid rgba(0,0,0,0.07)",
                  marginBottom: 12,
                }}>
                  <p style={{ margin: "0 0 12px", fontSize: 10, fontWeight: 600, color: "#ABABAB", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    Condition
                  </p>
                  <span style={{
                    display: "inline-block",
                    padding: "5px 16px",
                    borderRadius: 999,
                    fontSize: 16,
                    fontWeight: 500,
                    background: colors.bg,
                    color: colors.text,
                  }}>
                    {selectedEntry.condition}
                  </span>
                </div>
              );
            })()}

            {/* Metrics grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div style={{ background: "#F9F9F7", borderRadius: 10, padding: "14px 16px" }}>
                <p style={{ margin: "0 0 6px", fontSize: 11, color: "#8A8A8A" }}>Recovery</p>
                <p style={{ margin: 0, fontSize: 28, fontWeight: 300, color: "#1A1A1A" }}>
                  {selectedEntry.recovery_score != null ? Math.round(selectedEntry.recovery_score) : "—"}
                </p>
              </div>
              <div style={{ background: "#F9F9F7", borderRadius: 10, padding: "14px 16px" }}>
                <p style={{ margin: "0 0 6px", fontSize: 11, color: "#8A8A8A" }}>Exposure</p>
                <p style={{ margin: 0, fontSize: 28, fontWeight: 300, color: "#1A1A1A" }}>
                  {selectedEntry.exposure_score != null ? Math.round(selectedEntry.exposure_score) : "—"}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ScoreBit({ label, value }: { label: string; value: number | null }) {
  return (
    <span style={{ fontSize: 12, color: "#ABABAB" }}>
      {label}{" "}
      <span style={{ color: "#6B6B6B", fontWeight: 500 }}>
        {value != null ? Math.round(value) : "—"}
      </span>
    </span>
  );
}
