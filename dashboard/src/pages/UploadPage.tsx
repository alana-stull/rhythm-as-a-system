import React, { useState } from "react";
import { UploadZone } from "../components/upload/UploadZone";
import { api } from "../api/client";
import type { UploadResponse } from "../api/client";
import { radius, shadow } from "../tokens/design";

export function UploadPage() {
  const [ouraState, setOuraState] = useState<{
    loading: boolean;
    result: { rows: number; start: string; end: string } | null;
    error: string | null;
  }>({ loading: false, result: null, error: null });

  const [appleState, setAppleState] = useState<{
    loading: boolean;
    result: { rows: number; start: string; end: string } | null;
    error: string | null;
  }>({ loading: false, result: null, error: null });

  async function handleOura(file: File) {
    setOuraState({ loading: true, result: null, error: null });
    try {
      const res: UploadResponse = await api.uploadOura(file);
      setOuraState({
        loading: false,
        result: { rows: res.rows_processed, start: res.date_range.start, end: res.date_range.end },
        error: null,
      });
    } catch (e: unknown) {
      setOuraState({ loading: false, result: null, error: e instanceof Error ? e.message : "Upload failed" });
    }
  }

  async function handleApple(file: File) {
    setAppleState({ loading: true, result: null, error: null });
    try {
      const res: UploadResponse = await api.uploadAppleHealth(file);
      setAppleState({
        loading: false,
        result: { rows: res.rows_processed, start: res.date_range.start, end: res.date_range.end },
        error: null,
      });
    } catch (e: unknown) {
      setAppleState({ loading: false, result: null, error: e instanceof Error ? e.message : "Upload failed" });
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{
        background: "#FFFFFF",
        borderRadius: radius.lg,
        boxShadow: shadow.card,
        padding: "24px 28px",
      }}>
        <h2 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 600, color: "#1A1A1A" }}>
          Upload data
        </h2>
        <p style={{ margin: "0 0 28px", fontSize: 14, color: "#6B6B6B", lineHeight: 1.5 }}>
          Export a CSV from your wearable app and drop it below. Scores are recalculated automatically after upload.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <UploadZone
            label="Oura Ring"
            description="Export from Oura app → sleep or readiness CSV"
            onFile={handleOura}
            loading={ouraState.loading}
            result={ouraState.result}
            error={ouraState.error}
          />
          <UploadZone
            label="Apple Health"
            description="CSV export via Health Auto Export or QS Access"
            onFile={handleApple}
            loading={appleState.loading}
            result={appleState.result}
            error={appleState.error}
          />
        </div>
      </div>

      {/* Instructions */}
      <div style={{
        background: "#FFFFFF",
        borderRadius: radius.lg,
        boxShadow: shadow.card,
        padding: "24px 28px",
      }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 600, color: "#6B6B6B", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          How to export
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          <div>
            <p style={{ margin: "0 0 8px", fontWeight: 600, fontSize: 14, color: "#1A1A1A" }}>Oura Ring</p>
            <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "#6B6B6B", lineHeight: 1.8 }}>
              <li>Open the Oura app</li>
              <li>Go to Profile → Settings</li>
              <li>Tap "Export" → choose Sleep or Readiness</li>
              <li>Save as CSV and upload here</li>
            </ol>
          </div>
          <div>
            <p style={{ margin: "0 0 8px", fontWeight: 600, fontSize: 14, color: "#1A1A1A" }}>Apple Health</p>
            <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "#6B6B6B", lineHeight: 1.8 }}>
              <li>Install "Health Auto Export" app</li>
              <li>Select: Sleep, HRV, Resting HR</li>
              <li>Export as CSV</li>
              <li>Upload here</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
