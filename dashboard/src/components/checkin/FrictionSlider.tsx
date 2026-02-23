import React, { useState } from "react";
import { api } from "../../api/client";
import { radius } from "../../tokens/design";

const LABELS: Record<number, string> = {
  1: "Flowing",
  3: "Easy",
  5: "Moderate",
  7: "Hard",
  9: "Exhausting",
  10: "Maxed out",
};

export function FrictionSlider({ onSubmit }: { onSubmit?: () => void }) {
  const [value, setValue] = useState(5);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const label = LABELS[value] ?? (value <= 4 ? "Easy" : value <= 6 ? "Moderate" : "Hard");
  const today = new Date().toISOString().split("T")[0];

  async function handleSubmit() {
    try {
      setLoading(true);
      setError(null);
      await api.submitCheckin({ date: today, friction_rating: value, note: note || undefined });
      setSubmitted(true);
      onSubmit?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Submission failed");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div style={{ textAlign: "center", padding: "24px 0", color: "#2D6A42", fontSize: 15, fontWeight: 500 }}>
        ✓ Check-in recorded — scores updated.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A" }}>How hard does today feel?</span>
        <span style={{ fontSize: 20, fontWeight: 700, color: "#1A1A1A" }}>{value}</span>
      </div>

      <input
        type="range"
        min={1}
        max={10}
        value={value}
        onChange={e => setValue(Number(e.target.value))}
        style={{ width: "100%", accentColor: "#D94F5C" }}
      />

      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: 11, color: "#ABABAB" }}>1 — Flowing</span>
        <span style={{ fontSize: 13, color: "#6B6B6B", fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 11, color: "#ABABAB" }}>10 — Maxed</span>
      </div>

      <textarea
        placeholder="Optional note (what's making it feel this way?)"
        value={note}
        onChange={e => setNote(e.target.value)}
        maxLength={300}
        rows={2}
        style={{
          resize: "none",
          border: "1.5px solid #E8E8E6",
          borderRadius: radius.md,
          padding: "10px 14px",
          fontSize: 14,
          color: "#1A1A1A",
          fontFamily: "inherit",
          outline: "none",
          background: "#FAFAF8",
        }}
      />

      {error && <span style={{ fontSize: 13, color: "#D94F5C" }}>{error}</span>}

      <button
        onClick={handleSubmit}
        disabled={loading}
        style={{
          background: "#1A1A1A",
          color: "#FFFFFF",
          border: "none",
          borderRadius: radius.md,
          padding: "12px 0",
          fontSize: 14,
          fontWeight: 600,
          cursor: loading ? "wait" : "pointer",
          fontFamily: "inherit",
          transition: "opacity 0.15s ease",
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? "Saving…" : "Log check-in"}
      </button>
    </div>
  );
}
