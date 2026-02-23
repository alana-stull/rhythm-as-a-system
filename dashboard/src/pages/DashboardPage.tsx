import React, { useEffect, useRef, useState } from "react";
import { useLatestScores } from "../hooks/useLatestScores";
import { useLatestSuggestion } from "../hooks/useLatestSuggestion";

interface Task {
  id: string;
  name: string;
  effort: "low" | "medium" | "high";
}

const EFFORT_EXPOSURE: Record<"low" | "medium" | "high", number> = {
  low: 3,
  medium: 7,
  high: 12,
};

const EFFORT_COLORS: Record<"low" | "medium" | "high", { bg: string; text: string }> = {
  low:    { bg: "#E8F5EC", text: "#2D6A42" },
  medium: { bg: "#EAF0FB", text: "#2B4A8A" },
  high:   { bg: "#FDF3E7", text: "#8A4E1A" },
};

const CONDITION_COLORS: Record<string, { bg: string; text: string }> = {
  Aligned:    { bg: "#E8F5EC", text: "#2D6A42" },
  Balanced:   { bg: "#EAF0FB", text: "#2B4A8A" },
  Strained:   { bg: "#FDF3E7", text: "#8A4E1A" },
  Overloaded: { bg: "#FDE8E8", text: "#8A1A1A" },
};

const card: React.CSSProperties = {
  background: "rgba(255,255,255,0.65)",
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.07)",
  boxShadow: "0 1px 3px rgba(0,0,0,0.05), 0 4px 16px rgba(0,0,0,0.03)",
};

export function DashboardPage({ refreshKey }: { refreshKey?: string | null }) {
  const scores = useLatestScores(refreshKey);
  const suggestion = useLatestSuggestion();

  const [intention, setIntention] = useState(() =>
    localStorage.getItem("rhythm_intention") ?? ""
  );
  const [tasks, setTasks] = useState<Task[]>(() => {
    try { return JSON.parse(localStorage.getItem("rhythm_tasks") ?? "[]"); }
    catch { return []; }
  });
  const [showTasks, setShowTasks] = useState(false);
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [newTaskName, setNewTaskName] = useState("");
  const [newTaskEffort, setNewTaskEffort] = useState<"low" | "medium" | "high">("medium");

  // Persist to localStorage
  useEffect(() => { localStorage.setItem("rhythm_intention", intention); }, [intention]);
  useEffect(() => { localStorage.setItem("rhythm_tasks", JSON.stringify(tasks)); }, [tasks]);

  // calendarBase = the clean, pre-task exposure from the last sync.
  // Stored in localStorage so it's never contaminated by task writes back to the DB.
  const [calendarBase, setCalendarBase] = useState<number | null>(() => {
    const v = localStorage.getItem("rhythm_cal_exposure");
    return v != null ? parseFloat(v) : null;
  });

  // Initialise calendarBase from DB on first load (when it's not yet stored).
  useEffect(() => {
    if (scores.loading || !scores.data || calendarBase !== null) return;
    const base = scores.data.exposure_score ?? 40;
    setCalendarBase(base);
    localStorage.setItem("rhythm_cal_exposure", String(base));
  }, [scores.data, scores.loading, calendarBase]);

  // After a sync (refreshKey changes) reset calendarBase from fresh DB data.
  useEffect(() => {
    if (!refreshKey || scores.loading || !scores.data) return;
    const base = scores.data.exposure_score ?? 40;
    setCalendarBase(base);
    localStorage.setItem("rhythm_cal_exposure", String(base));
  }, [refreshKey]);

  // Auto-generate once when the user provides first input
  const hasTriggered = useRef(false);
  const hasInput = intention.trim().length > 0 || tasks.length > 0;

  useEffect(() => {
    if (
      hasInput &&
      !hasTriggered.current &&
      scores.data &&
      !suggestion.loading &&
      !suggestion.generating
    ) {
      hasTriggered.current = true;
      suggestion.generate();
    }
  }, [hasInput, scores.data, suggestion.loading]);

  // Date
  const dateStr = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).toUpperCase();

  // Scores — always base off calendarBase, never off the (possibly task-contaminated) DB value
  const recoveryScore = scores.data?.recovery_score ?? null;
  const taskImpact = tasks.reduce((sum, t) => sum + EFFORT_EXPOSURE[t.effort], 0);
  const exposureScore = Math.min(100, (calendarBase ?? 40) + taskImpact);
  const condition = scores.data?.condition ?? null;
  const condColors = condition ? (CONDITION_COLORS[condition] ?? { bg: "#F0F0EE", text: "#6B6B6B" }) : null;

  // Write task-adjusted exposure to DB (debounced 800ms)
  useEffect(() => {
    if (!scores.data || calendarBase === null) return;
    const id = setTimeout(() => {
      fetch("http://localhost:8000/scores/today/exposure", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exposure: exposureScore }),
      }).catch(() => {});
    }, 800);
    return () => clearTimeout(id);
  }, [exposureScore, scores.data, calendarBase]);

  function addTask() {
    if (!newTaskName.trim()) return;
    setTasks(prev => [...prev, { id: Date.now().toString(), name: newTaskName.trim(), effort: newTaskEffort }]);
    setNewTaskName("");
    setNewTaskEffort("medium");
    setIsAddingTask(false);
  }

  function updateEffort(id: string, effort: "low" | "medium" | "high") {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, effort } : t));
  }

  function removeTask(id: string) {
    setTasks(prev => prev.filter(t => t.id !== id));
  }

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "32px 24px 80px" }}>

      {/* ── Top: Recovery + Exposure ────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>

        {/* Recovery */}
        <div style={{ ...card, padding: 20 }}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M1 9 L3.5 5.5 L6 7.5 L11 2" stroke="#4CAF72" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span style={{ fontSize: 10, fontWeight: 600, color: "#ABABAB", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                Recovery
              </span>
            </div>
            <span style={{ fontSize: 11, color: "#C8C8C4" }}>Oura readiness</span>
          </div>
          {scores.loading ? (
            <div style={{ height: 44, width: 64, background: "#F0F0EE", borderRadius: 8, animation: "pulse 1.5s ease infinite" }} />
          ) : (
            <span style={{ fontSize: 40, fontWeight: 300, color: "#1A1A1A", letterSpacing: "-0.02em", lineHeight: 1 }}>
              {recoveryScore !== null ? Math.round(recoveryScore) : "—"}
            </span>
          )}
        </div>

        {/* Exposure */}
        <div style={{ ...card, padding: 20, transition: "all 0.5s ease" }}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 1 L7.2 4.2 L11 4.2 L8.2 6.4 L9.2 10 L6 7.8 L2.8 10 L3.8 6.4 L1 4.2 L4.8 4.2 Z"
                  stroke="#5B8DE8" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              </svg>
              <span style={{ fontSize: 10, fontWeight: 600, color: "#ABABAB", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                Exposure
              </span>
            </div>
            <span style={{ fontSize: 11, color: "#C8C8C4" }}>Calendar load</span>
          </div>
          <span style={{ fontSize: 40, fontWeight: 300, color: "#1A1A1A", letterSpacing: "-0.02em", lineHeight: 1, transition: "all 0.5s ease" }}>
            {Math.round(exposureScore)}
          </span>
        </div>
      </div>

      {/* ── Your Rhythm (always visible) ────────────────────────────────── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{
          background: "linear-gradient(135deg, #F9F9F7 0%, #FFFFFF 100%)",
          borderRadius: 16,
          padding: "28px 28px 24px",
          border: "1px solid rgba(0,0,0,0.08)",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05), 0 4px 16px rgba(0,0,0,0.03)",
        }}>
          <p style={{ margin: "0 0 20px", fontSize: 10, fontWeight: 600, color: "#ABABAB", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            Your Rhythm
          </p>

          {scores.loading ? (
            <div style={{ height: 52, width: 140, background: "#F0F0EE", borderRadius: 8, animation: "pulse 1.5s ease infinite" }} />
          ) : !hasInput ? (
            /* No input yet */
            <p style={{ margin: 0, fontSize: 15, color: "#ABABAB", lineHeight: 1.65, maxWidth: 340 }}>
              Add your tasks or primary intention to see your full rhythm.
            </p>
          ) : (
            /* Input exists — show condition + API content */
            <>
              <div style={{ marginBottom: 20 }}>
                {condColors && condition ? (
                  <span style={{
                    display: "inline-block",
                    padding: "5px 16px",
                    borderRadius: 999,
                    fontSize: 16,
                    fontWeight: 500,
                    background: condColors.bg,
                    color: condColors.text,
                    letterSpacing: "-0.01em",
                  }}>
                    {condition}
                  </span>
                ) : (
                  <span style={{ fontSize: 16, color: "#ABABAB" }}>—</span>
                )}
              </div>

              {/* API-generated content */}
              {suggestion.generating ? (
                <p style={{ margin: "0 0 20px", fontSize: 14, color: "#C0C0BC", lineHeight: 1.7, fontStyle: "italic" }}>
                  Getting your rhythm…
                </p>
              ) : suggestion.data ? (
                <>
                  {/* Reflection */}
                  <p style={{ margin: "0 0 20px", fontSize: 14, color: "#4A4A4A", lineHeight: 1.7 }}>
                    {suggestion.data.reflection}
                  </p>

                  {/* Suggested Approach — inline in this card */}
                  {suggestion.data.bullets.length > 0 && (
                    <>
                      <div style={{ height: 1, background: "rgba(0,0,0,0.06)", margin: "0 0 16px" }} />
                      <p style={{ margin: "0 0 10px", fontSize: 10, fontWeight: 600, color: "#ABABAB", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                        Suggested Approach
                      </p>
                      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 7 }}>
                        {suggestion.data.bullets.map((bullet, i) => (
                          <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 14, color: "#4A4A4A", lineHeight: 1.6 }}>
                            <span style={{ color: "#C0C0BC", marginTop: 3, flexShrink: 0 }}>•</span>
                            <span>{bullet}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </>
              ) : (
                /* No data yet and not generating — scores may not be uploaded */
                !scores.data && (
                  <p style={{ margin: 0, fontSize: 14, color: "#C0C0BC", lineHeight: 1.65 }}>
                    Import wearable data to generate a personalised insight.
                  </p>
                )
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Intention ────────────────────────────────────────────────────── */}
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <p style={{
          margin: "0 0 16px",
          fontSize: 10,
          fontWeight: 600,
          color: "#ABABAB",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}>
          {dateStr}
        </p>

        <h2 style={{
          margin: "0 0 20px",
          fontSize: 24,
          fontWeight: 500,
          color: "#1A1A1A",
          lineHeight: 1.35,
          letterSpacing: "-0.01em",
        }}>
          What's your main priority today?
        </h2>

        <div style={{ maxWidth: 440, margin: "0 auto" }}>
          <label style={{
            display: "block",
            fontSize: 10,
            fontWeight: 600,
            color: "#ABABAB",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            marginBottom: 10,
          }}>
            Primary Intention
          </label>
          <input
            type="text"
            value={intention}
            onChange={e => setIntention(e.target.value)}
            placeholder="What feels most important today?"
            style={{
              width: "100%",
              padding: "10px 0",
              border: "none",
              borderBottom: "1px solid #E0E0DE",
              background: "transparent",
              fontSize: 16,
              color: "#1A1A1A",
              outline: "none",
              textAlign: "center",
              fontFamily: "inherit",
              transition: "border-color 0.2s ease",
              boxSizing: "border-box",
            }}
            onFocus={e => { (e.target as HTMLInputElement).style.borderBottomColor = "#6B6B6B"; }}
            onBlur={e => { (e.target as HTMLInputElement).style.borderBottomColor = "#E0E0DE"; }}
          />
        </div>
      </div>

      {/* ── Tasks ────────────────────────────────────────────────────────── */}
      <div>
        <button
          onClick={() => setShowTasks(!showTasks)}
          style={{
            ...card,
            width: "100%",
            padding: "14px 18px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            cursor: "pointer",
            fontFamily: "inherit",
            textAlign: "left",
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 500, color: "#3A3A3A" }}>Tasks</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {tasks.length > 0 && (
              <span style={{ fontSize: 12, color: "#ABABAB" }}>{tasks.length}</span>
            )}
            <svg
              width="14" height="14" viewBox="0 0 14 14" fill="none"
              style={{ transform: showTasks ? "rotate(180deg)" : "none", transition: "transform 0.2s ease" }}
            >
              <path d="M2 5L7 10L12 5" stroke="#C0C0BC" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </button>

        {showTasks && (
          <div style={{ ...card, padding: 20, marginTop: 8, animation: "fadeIn 0.2s ease" }}>

            {tasks.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                {tasks.map((task, i) => (
                  <div
                    key={task.id}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 12,
                      paddingTop: i > 0 ? 14 : 0,
                      paddingBottom: i < tasks.length - 1 ? 14 : 0,
                      borderBottom: i < tasks.length - 1 ? "1px solid #F4F4F2" : "none",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: "0 0 8px", fontSize: 14, color: "#1A1A1A" }}>{task.name}</p>
                      <div style={{ display: "flex", gap: 6 }}>
                        {(["low", "medium", "high"] as const).map(level => (
                          <button
                            key={level}
                            onClick={() => updateEffort(task.id, level)}
                            style={{
                              padding: "3px 10px",
                              borderRadius: 8,
                              border: "none",
                              fontSize: 11,
                              fontWeight: task.effort === level ? 600 : 400,
                              cursor: "pointer",
                              fontFamily: "inherit",
                              transition: "all 0.15s ease",
                              background: task.effort === level ? EFFORT_COLORS[level].bg : "#F4F4F2",
                              color: task.effort === level ? EFFORT_COLORS[level].text : "#8A8A8A",
                            }}
                          >
                            {level[0].toUpperCase() + level.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={() => removeTask(task.id)}
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 6,
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#C0C0BC",
                        fontSize: 18,
                        flexShrink: 0,
                        lineHeight: 1,
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {isAddingTask ? (
              <div>
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <input
                    type="text"
                    value={newTaskName}
                    onChange={e => setNewTaskName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter") addTask();
                      if (e.key === "Escape") { setIsAddingTask(false); setNewTaskName(""); }
                    }}
                    placeholder="Task name..."
                    autoFocus
                    style={{
                      flex: 1,
                      padding: "8px 12px",
                      border: "1px solid #E0E0DE",
                      borderRadius: 8,
                      background: "#FFFFFF",
                      fontSize: 14,
                      color: "#1A1A1A",
                      outline: "none",
                      fontFamily: "inherit",
                    }}
                  />
                  <button
                    onClick={addTask}
                    style={{
                      padding: "8px 16px",
                      background: "#1A1A1A",
                      color: "#FFFFFF",
                      border: "none",
                      borderRadius: 8,
                      fontSize: 13,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      flexShrink: 0,
                    }}
                  >
                    Add
                  </button>
                  <button
                    onClick={() => { setIsAddingTask(false); setNewTaskName(""); }}
                    style={{
                      padding: "8px 12px",
                      background: "none",
                      color: "#8A8A8A",
                      border: "none",
                      borderRadius: 8,
                      fontSize: 13,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    Cancel
                  </button>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {(["low", "medium", "high"] as const).map(level => (
                    <button
                      key={level}
                      onClick={() => setNewTaskEffort(level)}
                      style={{
                        padding: "3px 10px",
                        borderRadius: 8,
                        border: "none",
                        fontSize: 11,
                        fontWeight: newTaskEffort === level ? 600 : 400,
                        cursor: "pointer",
                        fontFamily: "inherit",
                        background: newTaskEffort === level ? EFFORT_COLORS[level].bg : "#F4F4F2",
                        color: newTaskEffort === level ? EFFORT_COLORS[level].text : "#8A8A8A",
                        transition: "all 0.15s ease",
                      }}
                    >
                      {level[0].toUpperCase() + level.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <button
                onClick={() => setIsAddingTask(true)}
                style={{
                  width: "100%",
                  padding: "9px",
                  border: "1.5px dashed #DCDCD8",
                  borderRadius: 10,
                  background: "none",
                  color: "#ABABAB",
                  fontSize: 13,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                }}
              >
                + Add task
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
