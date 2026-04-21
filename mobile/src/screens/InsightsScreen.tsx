import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { DailyScore, getScoreHistory } from "../api/client";
import { cardBase, colors, font, radius, space } from "../theme";

// ── Types ─────────────────────────────────────────────────────────────────────
type Window = 7 | 30 | 90;
type Series = "both" | "rhythm" | "oura";

// Map condition → numeric rhythm score (0–100)
function conditionToScore(condition: string): number {
  switch (condition) {
    case "Aligned":    return 90;
    case "Balanced":   return 65;
    case "Strained":   return 38;
    case "Overloaded": return 20;
    default:           return 50;
  }
}

// ── Pure-View line chart ──────────────────────────────────────────────────────
interface ChartPoint { x: number; y: number; label: string; value: number | null }

interface LineChartProps {
  series: { points: ChartPoint[]; color: string; label: string }[];
  width: number;
  height?: number;
}

function LineChart({ series, width, height = 160 }: LineChartProps) {
  const padL = 32;
  const padR = 12;
  const padT = 10;
  const padB = 28;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;

  // Y-axis gridlines at 0, 25, 50, 75, 100
  const gridLines = [0, 25, 50, 75, 100];

  // Map a value (0–100) to pixel y (inverted: 100 = top)
  function toY(v: number) {
    return padT + chartH - (v / 100) * chartH;
  }

  // Render line segments between consecutive points
  function renderSegments(points: ChartPoint[], color: string) {
    const valid = points.filter(p => p.value != null);
    return valid.slice(0, -1).map((p, i) => {
      const next = valid[i + 1];
      const x1 = padL + p.x * chartW;
      const y1 = toY(p.value!);
      const x2 = padL + next.x * chartW;
      const y2 = toY(next.value!);
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);
      return (
        <View
          key={`${i}`}
          style={{
            position: "absolute",
            left: x1,
            top: y1 - 1,
            width: len,
            height: 2,
            backgroundColor: color,
            borderRadius: 1,
            transform: [{ rotate: `${angle}deg` }],
            transformOrigin: "0 50%",
          }}
        />
      );
    });
  }

  // Render dots
  function renderDots(points: ChartPoint[], color: string) {
    return points
      .filter(p => p.value != null)
      .map((p, i) => (
        <View
          key={`dot-${i}`}
          style={{
            position: "absolute",
            left: padL + p.x * chartW - 3,
            top: toY(p.value!) - 3,
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: color,
            borderWidth: 1.5,
            borderColor: colors.bg.surface,
          }}
        />
      ));
  }

  // X-axis labels — show ~5 evenly spaced
  const allPoints = series[0]?.points ?? [];
  const labelStep = Math.max(1, Math.floor(allPoints.length / 5));
  const xLabels = allPoints.filter((_, i) =>
    i === 0 || i === allPoints.length - 1 || i % labelStep === 0
  );

  return (
    <View style={{ width, height }}>
      {/* Grid lines + Y labels */}
      {gridLines.map(v => (
        <View key={v} style={{ position: "absolute", left: 0, top: toY(v) - 0.5, width, flexDirection: "row", alignItems: "center" }}>
          <Text style={{ width: padL - 4, fontSize: 9, color: colors.text.muted, textAlign: "right" }}>{v}</Text>
          <View style={{ flex: 1, height: 0.5, backgroundColor: "rgba(0,0,0,0.06)" }} />
        </View>
      ))}

      {/* Line segments + dots */}
      <View style={{ position: "absolute", left: 0, top: 0, width, height }}>
        {series.map(s => renderSegments(s.points, s.color))}
        {series.map(s => renderDots(s.points, s.color))}
      </View>

      {/* X-axis labels */}
      {xLabels.map((p, i) => (
        <Text
          key={i}
          style={{
            position: "absolute",
            left: padL + p.x * chartW - 16,
            top: height - padB + 4,
            width: 32,
            fontSize: 9,
            color: colors.text.muted,
            textAlign: "center",
          }}
        >
          {p.label}
        </Text>
      ))}
    </View>
  );
}

// ── Legend dot ────────────────────────────────────────────────────────────────
function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
      <View style={{ width: 10, height: 2.5, backgroundColor: color, borderRadius: 1 }} />
      <Text style={{ fontSize: font.size.xs, color: colors.text.secondary }}>{label}</Text>
    </View>
  );
}

// ── Build chart points from entries ──────────────────────────────────────────
function buildPoints(entries: DailyScore[]): {
  rhythmPoints: ChartPoint[];
  ouraPoints: ChartPoint[];
} {
  if (entries.length === 0) return { rhythmPoints: [], ouraPoints: [] };

  const n = entries.length;
  return {
    rhythmPoints: entries.map((e, i) => ({
      x: n === 1 ? 0.5 : i / (n - 1),
      y: conditionToScore(e.condition),
      label: shortDate(e.date),
      value: conditionToScore(e.condition),
    })),
    ouraPoints: entries.map((e, i) => ({
      x: n === 1 ? 0.5 : i / (n - 1),
      y: e.recovery_score ?? 0,
      label: shortDate(e.date),
      value: e.recovery_score,
    })),
  };
}

function shortDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
}

// ── Stats ─────────────────────────────────────────────────────────────────────
function computeStats(entries: DailyScore[]) {
  const withRecovery = entries.filter(e => e.recovery_score != null);
  const avg = withRecovery.length
    ? Math.round(withRecovery.reduce((s, e) => s + e.recovery_score!, 0) / withRecovery.length)
    : null;
  const peak = withRecovery.length
    ? Math.round(Math.max(...withRecovery.map(e => e.recovery_score!)))
    : null;
  const condCounts: Record<string, number> = {};
  for (const e of entries) condCounts[e.condition] = (condCounts[e.condition] ?? 0) + 1;
  const topCondition = Object.entries(condCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return { avg, peak, topCondition, daysWithData: withRecovery.length };
}

// ── Component ─────────────────────────────────────────────────────────────────
export function InsightsScreen() {
  const [windowDays, setWindowDays] = useState<Window>(30);
  const [series, setSeries] = useState<Series>("both");
  const [entries, setEntries] = useState<DailyScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { width: screenWidth } = useWindowDimensions();
  const chartWidth = screenWidth - space[12] * 2 - space[12] * 2; // account for card padding

  const fetchData = useCallback(async (days: Window) => {
    setError(null);
    try {
      const { entries: data } = await getScoreHistory(days);
      setEntries(data); // already ascending from backend
    } catch {
      setError("Could not load data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchData(windowDays);
  }, [windowDays, fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData(windowDays);
    setRefreshing(false);
  }, [windowDays, fetchData]);

  const stats = computeStats(entries);
  const { rhythmPoints, ouraPoints } = buildPoints(entries);

  const chartSeries = [
    ...(series !== "oura"   ? [{ points: rhythmPoints, color: "#5B8DE8", label: "Rhythm" }] : []),
    ...(series !== "rhythm" ? [{ points: ouraPoints,   color: colors.ring.recovery, label: "Oura Recovery" }] : []),
  ];

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text.muted} />}
    >
      <Text style={styles.pageTitle}>Insights</Text>

      {/* ── Window toggle ── */}
      <View style={styles.toggleRow}>
        {([7, 30, 90] as Window[]).map(w => (
          <TouchableOpacity
            key={w}
            onPress={() => setWindowDays(w)}
            style={[styles.toggleBtn, windowDays === w && styles.toggleBtnActive]}
          >
            <Text style={[styles.toggleText, windowDays === w && styles.toggleTextActive]}>
              {w === 7 ? "1W" : w === 30 ? "1M" : "3M"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Stats row ── */}
      {!loading && entries.length > 0 && (
        <View style={styles.statsRow}>
          <StatCell label="AVG RECOVERY" value={stats.avg != null ? `${stats.avg}` : "—"} />
          <StatCell label="PEAK" value={stats.peak != null ? `${stats.peak}` : "—"} />
          <StatCell label="DAYS TRACKED" value={`${stats.daysWithData}`} />
          <StatCell label="TOP STATE" value={stats.topCondition ?? "—"} small />
        </View>
      )}

      {/* ── Chart card ── */}
      <View style={styles.card}>
        <View style={styles.chartHeader}>
          <Text style={styles.cardLabel}>SCORE OVER TIME</Text>
          {/* Series selector */}
          <View style={styles.seriesToggle}>
            {([["both", "Both"], ["rhythm", "Rhythm"], ["oura", "Oura"]] as [Series, string][]).map(([key, lbl]) => (
              <TouchableOpacity
                key={key}
                onPress={() => setSeries(key)}
                style={[styles.seriesBtn, series === key && styles.seriesBtnActive]}
              >
                <Text style={[styles.seriesBtnText, series === key && styles.seriesBtnTextActive]}>
                  {lbl}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {loading ? (
          <View style={{ height: 160, alignItems: "center", justifyContent: "center" }}>
            <Text style={styles.emptyText}>Loading…</Text>
          </View>
        ) : error ? (
          <View style={{ height: 80, alignItems: "center", justifyContent: "center" }}>
            <Text style={[styles.emptyText, { color: "#8A2030" }]}>{error}</Text>
          </View>
        ) : entries.length === 0 ? (
          <View style={{ height: 120, alignItems: "center", justifyContent: "center" }}>
            <Text style={styles.emptyText}>No data for this period.</Text>
            <Text style={[styles.emptyText, { fontSize: font.size.xs, marginTop: 4 }]}>
              Sync Oura to populate history.
            </Text>
          </View>
        ) : (
          <>
            <LineChart series={chartSeries} width={chartWidth} height={180} />
            {/* Legend */}
            <View style={styles.legend}>
              {chartSeries.map(s => (
                <LegendItem key={s.label} color={s.color} label={s.label} />
              ))}
            </View>
          </>
        )}
      </View>

      {/* ── Condition breakdown ── */}
      {!loading && entries.length > 0 && (
        <ConditionBreakdown entries={entries} />
      )}

    </ScrollView>
  );
}

// ── Condition breakdown ───────────────────────────────────────────────────────
function ConditionBreakdown({ entries }: { entries: DailyScore[] }) {
  const ORDER = ["Aligned", "Balanced", "Strained", "Overloaded"];
  const counts: Record<string, number> = {};
  for (const e of entries) counts[e.condition] = (counts[e.condition] ?? 0) + 1;
  const total = entries.length;

  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>STATE DISTRIBUTION</Text>
      {ORDER.filter(c => counts[c] != null).map(c => {
        const col = colors.condition[c] ?? { bg: "#F0F0EE", text: "#6B6B6B", dot: "#ABABAB" };
        const pct = counts[c] / total;
        return (
          <View key={c} style={styles.barRow}>
            <View style={styles.barLabelRow}>
              <View style={[styles.barDot, { backgroundColor: col.dot }]} />
              <Text style={styles.barLabel}>{c}</Text>
              <Text style={styles.barCount}>{counts[c]}d</Text>
            </View>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${Math.round(pct * 100)}%` as any, backgroundColor: col.dot }]} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

function StatCell({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <View style={styles.statCell}>
      <Text style={[styles.statValue, small && styles.statValueSmall]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.bg.primary },
  content: { padding: space[12], paddingBottom: space[24] },

  pageTitle: {
    fontSize: font.size.title,
    fontWeight: font.weight.medium,
    color: colors.text.primary,
    letterSpacing: -0.3,
    marginBottom: space[8],
  },

  toggleRow: {
    flexDirection: "row",
    backgroundColor: "#EBEBEB",
    borderRadius: radius.full,
    padding: 3,
    gap: 3,
    marginBottom: space[8],
  },

  toggleBtn: {
    flex: 1,
    paddingVertical: space[2],
    borderRadius: radius.full,
    alignItems: "center",
  },

  toggleBtnActive: {
    backgroundColor: colors.bg.surface,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },

  toggleText: {
    fontSize: font.size.sm,
    fontWeight: font.weight.medium,
    color: colors.text.secondary,
  },

  toggleTextActive: {
    color: colors.text.primary,
    fontWeight: font.weight.semibold,
  },

  statsRow: {
    flexDirection: "row",
    gap: space[3],
    marginBottom: space[5],
  },

  statCell: {
    flex: 1,
    ...cardBase,
    padding: space[5],
    alignItems: "center",
    gap: 2,
  },

  statValue: {
    fontSize: 20,
    fontWeight: font.weight.light,
    color: colors.text.primary,
    letterSpacing: -0.3,
  },

  statValueSmall: {
    fontSize: 12,
    fontWeight: font.weight.medium,
    letterSpacing: 0,
  },

  statLabel: {
    fontSize: 8,
    fontWeight: font.weight.semibold,
    color: colors.text.muted,
    letterSpacing: 0.5,
    textAlign: "center",
  },

  card: {
    ...cardBase,
    padding: space[12],
    marginBottom: space[5],
  },

  chartHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space[8],
  },

  cardLabel: {
    fontSize: font.size.micro,
    fontWeight: font.weight.semibold,
    color: colors.text.muted,
    letterSpacing: font.letterSpacing.wide,
  },

  seriesToggle: {
    flexDirection: "row",
    backgroundColor: "#F0F0EE",
    borderRadius: radius.full,
    padding: 2,
    gap: 2,
  },

  seriesBtn: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: radius.full,
  },

  seriesBtnActive: {
    backgroundColor: colors.bg.surface,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 1,
    elevation: 1,
  },

  seriesBtnText: {
    fontSize: font.size.xs,
    color: colors.text.secondary,
    fontWeight: font.weight.medium,
  },

  seriesBtnTextActive: {
    color: colors.text.primary,
    fontWeight: font.weight.semibold,
  },

  legend: {
    flexDirection: "row",
    gap: space[8],
    marginTop: space[5],
    justifyContent: "center",
  },

  emptyText: {
    fontSize: font.size.sm,
    color: colors.text.muted,
    textAlign: "center",
  },

  barRow: { marginBottom: space[6] },

  barLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    marginBottom: 5,
  },

  barDot: { width: 7, height: 7, borderRadius: 999 },

  barLabel: {
    flex: 1,
    fontSize: font.size.sm,
    color: colors.text.secondary,
    fontWeight: font.weight.medium,
  },

  barCount: { fontSize: font.size.sm, color: colors.text.muted },

  barTrack: {
    height: 5,
    backgroundColor: "#EBEBEB",
    borderRadius: radius.full,
    overflow: "hidden",
  },

  barFill: {
    height: "100%",
    borderRadius: radius.full,
    opacity: 0.75,
  },
});
