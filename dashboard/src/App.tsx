import React, { useState } from "react";
import { DashboardPage } from "./pages/DashboardPage";
import { HistoryPage } from "./pages/HistoryPage";
import { useOuraStatus } from "./hooks/useOuraStatus";
import { useCalendarStatus } from "./hooks/useCalendarStatus";

type Tab = "today" | "history";

export default function App() {
  const [tab, setTab] = useState<Tab>("today");
  const oura = useOuraStatus();
  const gcal = useCalendarStatus();

  return (
    <div style={{
      minHeight: "100vh",
      background: "#F9F9F7",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif",
    }}>
      {/* Header */}
      <header style={{
        position: "sticky",
        top: 0,
        zIndex: 10,
        background: "#FFFFFF",
        borderBottom: "1px solid rgba(0,0,0,0.07)",
        padding: "0 24px",
      }}>
        <div style={{
          maxWidth: 640,
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 56,
        }}>
          {/* Wordmark */}
          <span style={{
            fontSize: 17,
            fontWeight: 400,
            letterSpacing: "-0.2px",
            color: "#1A1A1A",
          }}>
            rhythm
          </span>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* Tab nav */}
            <nav style={{ display: "flex", gap: 2 }}>
              {([{ id: "today", label: "Today" }, { id: "history", label: "History" }] as { id: Tab; label: string }[]).map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  style={{
                    background: tab === t.id ? "rgba(0,0,0,0.06)" : "none",
                    border: "none",
                    borderRadius: 8,
                    padding: "6px 14px",
                    fontSize: 14,
                    fontWeight: tab === t.id ? 500 : 400,
                    color: tab === t.id ? "#1A1A1A" : "#6B6B6B",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    transition: "all 0.15s ease",
                  }}
                >
                  {t.label}
                </button>
              ))}
            </nav>

            {/* Oura button */}
            {!oura.loading && (
              oura.status?.connected ? (
                <button
                  onClick={() => oura.sync()}
                  disabled={oura.syncing}
                  title={oura.status.last_synced
                    ? `Last synced: ${new Date(oura.status.last_synced).toLocaleString()}`
                    : "Sync Oura data"}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "5px 12px", background: "#F4F4F2",
                    border: "1px solid rgba(0,0,0,0.07)", borderRadius: 999,
                    fontSize: 12, color: oura.syncing ? "#ABABAB" : "#6B6B6B",
                    cursor: oura.syncing ? "default" : "pointer",
                    fontFamily: "inherit", transition: "all 0.15s ease",
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4CAF72", flexShrink: 0 }} />
                  {oura.syncing ? "Syncing…" : "Sync Oura"}
                </button>
              ) : (
                <button
                  onClick={() => oura.connect()}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "5px 12px", background: "#F4F4F2",
                    border: "1px solid rgba(0,0,0,0.07)", borderRadius: 999,
                    fontSize: 12, color: "#6B6B6B", cursor: "pointer",
                    fontFamily: "inherit", transition: "all 0.15s ease",
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#C0C0BC", flexShrink: 0 }} />
                  Connect Oura
                </button>
              )
            )}

            {/* Calendar button */}
            {!gcal.loading && (
              gcal.status?.connected ? (
                <button
                  onClick={() => gcal.sync()}
                  disabled={gcal.syncing}
                  title={gcal.status.last_synced
                    ? `Last synced: ${new Date(gcal.status.last_synced).toLocaleString()}`
                    : "Sync calendar"}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "5px 12px", background: "#F4F4F2",
                    border: "1px solid rgba(0,0,0,0.07)", borderRadius: 999,
                    fontSize: 12, color: gcal.syncing ? "#ABABAB" : "#6B6B6B",
                    cursor: gcal.syncing ? "default" : "pointer",
                    fontFamily: "inherit", transition: "all 0.15s ease",
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#5B8DE8", flexShrink: 0 }} />
                  {gcal.syncing ? "Syncing…" : "Sync Calendar"}
                </button>
              ) : (
                <button
                  onClick={() => gcal.connect()}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "5px 12px", background: "#F4F4F2",
                    border: "1px solid rgba(0,0,0,0.07)", borderRadius: 999,
                    fontSize: 12, color: "#6B6B6B", cursor: "pointer",
                    fontFamily: "inherit", transition: "all 0.15s ease",
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#C0C0BC", flexShrink: 0 }} />
                  Connect Calendar
                </button>
              )
            )}
          </div>
        </div>
      </header>

      {/* Page */}
      <main>
        {tab === "today" && <DashboardPage refreshKey={`${oura.status?.last_synced}|${gcal.status?.last_synced}`} />}
        {tab === "history" && <HistoryPage refreshKey={`${oura.status?.last_synced}|${gcal.status?.last_synced}`} />}
      </main>
    </div>
  );
}
