import React, { useRef, useState } from "react";
import { radius } from "../../tokens/design";

interface UploadZoneProps {
  label: string;
  description: string;
  onFile: (file: File) => void;
  loading: boolean;
  result?: { rows: number; start: string; end: string } | null;
  error?: string | null;
}

export function UploadZone({ label, description, onFile, loading, result, error }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = (file: File) => {
    if (!file.name.endsWith(".csv")) return;
    onFile(file);
  };

  return (
    <div
      onClick={() => !loading && inputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
      }}
      style={{
        background: dragOver ? "#F0F4FF" : "#FAFAF8",
        border: `1.5px dashed ${dragOver ? "#5B8DE8" : result ? "#4CAF72" : error ? "#D94F5C" : "#D8D8D6"}`,
        borderRadius: radius.lg,
        padding: "32px 24px",
        cursor: loading ? "wait" : "pointer",
        transition: "all 0.2s ease",
        textAlign: "center",
        minHeight: 160,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        style={{ display: "none" }}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />

      {loading ? (
        <span style={{ fontSize: 14, color: "#6B6B6B" }}>Uploading…</span>
      ) : result ? (
        <>
          <span style={{ fontSize: 22 }}>✓</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#2D6A42" }}>
            {result.rows} days imported
          </span>
          <span style={{ fontSize: 12, color: "#6B6B6B" }}>
            {result.start} → {result.end}
          </span>
          <span style={{ fontSize: 12, color: "#ABABAB", marginTop: 4 }}>
            Drop another file to update
          </span>
        </>
      ) : error ? (
        <>
          <span style={{ fontSize: 22 }}>×</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#D94F5C" }}>Upload failed</span>
          <span style={{ fontSize: 12, color: "#6B6B6B", maxWidth: 240 }}>{error}</span>
        </>
      ) : (
        <>
          <UploadIcon />
          <span style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A" }}>{label}</span>
          <span style={{ fontSize: 13, color: "#6B6B6B", maxWidth: 260 }}>{description}</span>
          <span style={{ fontSize: 12, color: "#ABABAB", marginTop: 4 }}>
            Drop a .csv file or click to browse
          </span>
        </>
      )}
    </div>
  );
}

function UploadIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ABABAB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}
