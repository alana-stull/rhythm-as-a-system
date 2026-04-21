import React, { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { DailyScore, getScoreHistory } from "../api/client";
import { StateBadge } from "../components/StateBadge";
import { cardBase, colors, font, radius, space } from "../theme";

type Window = 7 | 14 | 30;

// ── Derived stats ─────────────────────────────────────────────────────────────
function computeStats(entries: DailyScore[]) {
  const withRecovery = entries.filter(e => e.recovery_score != null);

  const avg = withRecovery.length
    ? Math.round(withRecovery.reduce((s, e) => s + e.recovery_score!, 0) / withRecovery.length)
    : null;

  const peak = withRecovery.length
    ? Math.round(Math.max(...withRecovery.map(e => e.recovery_score!)))
    : null;

  // Streak: consecutive days with data, most-recent first
  let streak = 0;
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].recovery_score != null) streak++;
    else break;
  }

  return { avg, peak, streak };
}

function formatDate(dateStr: string) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
}

// ── Component ─────────────────────────────────────────────────────────────────
export function HistoryScreen() {
  const [days, setDays] = useState<Window>(14);
  const [entries, setEntries] = useState<DailyScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async (d: Window) => {
    setError(null);
    try {
      const { entries: data } = await getScoreHistory(d);
      setEntries([...data].reverse()); // most recent first
    } catch {
      setError("Could not load history.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchHistory(days);
  }, [days, fetchHistory]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchHistory(days);
    setRefreshing(false);
  }, [days, fetchHistory]);

  const stats = computeStats(entries);

  return (
    <View style={styles.container}>
      {/* ── Window toggle ── */}
      <View style={styles.toggleRow}>
        {([7, 14, 30] as Window[]).map(w => (
          <TouchableOpacity
            key={w}
            onPress={() => setDays(w)}
            style={[styles.toggleBtn, days === w && styles.toggleBtnActive]}
          >
            <Text style={[styles.toggleText, days === w && styles.toggleTextActive]}>
              {w}d
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Summary stats ── */}
      {!loading && (
        <View style={styles.statsRow}>
          <StatCard label="Avg Recovery" value={stats.avg != null ? String(stats.avg) : "—"} unit="/ 100" />
          <StatCard label="Streak" value={String(stats.streak)} unit="days" />
          <StatCard label="Peak" value={stats.peak != null ? String(stats.peak) : "—"} unit="/ 100" />
        </View>
      )}

      {loading && !refreshing ? (
        <View style={styles.skeletonList}>
          {[1, 2, 3, 4, 5].map(i => (
            <View key={i} style={styles.skeletonRow} />
          ))}
        </View>
      ) : error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={item => item.date}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No data for this period.</Text>
          }
          renderItem={({ item, index }) => (
            <View style={[styles.entryRow, index === 0 && styles.entryRowFirst]}>
              <View style={styles.entryLeft}>
                <Text style={styles.entryDate}>{formatDate(item.date)}</Text>
                <StateBadge condition={item.condition} size="sm" />
              </View>
              <View style={styles.entryScores}>
                <ScoreChip label="R" value={item.recovery_score} color={colors.ring.recovery} />
                <ScoreChip label="E" value={item.exposure_score} color={colors.ring.exposure} />
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────
function StatCard({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <View style={statStyles.card}>
      <Text style={statStyles.value}>{value}</Text>
      <Text style={statStyles.unit}>{unit}</Text>
      <Text style={statStyles.label}>{label.toUpperCase()}</Text>
    </View>
  );
}

function ScoreChip({ label, value, color }: { label: string; value: number | null; color: string }) {
  return (
    <View style={chipStyles.chip}>
      <Text style={[chipStyles.label, { color }]}>{label}</Text>
      <Text style={chipStyles.value}>{value != null ? Math.round(value) : "—"}</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },

  toggleRow: {
    flexDirection: "row",
    margin: space[12],
    marginBottom: space[6],
    backgroundColor: "#EBEBEB",
    borderRadius: radius.full,
    padding: 3,
    gap: 3,
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
    gap: space[4],
    marginHorizontal: space[12],
    marginBottom: space[6],
  },

  listContent: {
    marginHorizontal: space[12],
    paddingBottom: space[24],
  },

  entryRow: {
    ...cardBase,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: space[8],
    marginBottom: space[3],
  },

  entryRowFirst: {},

  entryLeft: {
    flex: 1,
    gap: 6,
  },

  entryDate: {
    fontSize: font.size.sm,
    fontWeight: font.weight.medium,
    color: colors.text.primary,
  },

  entryScores: {
    flexDirection: "row",
    gap: space[6],
  },

  skeletonList: {
    marginHorizontal: space[12],
    gap: space[3],
  },

  skeletonRow: {
    height: 64,
    backgroundColor: "#F0F0EE",
    borderRadius: radius.lg,
  },

  errorBanner: {
    margin: space[12],
    backgroundColor: "#FCEAEB",
    borderRadius: radius.md,
    padding: space[6],
  },

  errorText: {
    fontSize: font.size.sm,
    color: "#8A2030",
    textAlign: "center",
  },

  emptyText: {
    fontSize: font.size.base,
    color: colors.text.muted,
    textAlign: "center",
    marginTop: space[16],
  },
});

const statStyles = StyleSheet.create({
  card: {
    ...cardBase,
    flex: 1,
    padding: space[6],
    paddingVertical: space[5],
    alignItems: "flex-start",
  },

  value: {
    fontSize: 28,
    fontWeight: font.weight.light,
    color: colors.text.primary,
    letterSpacing: -0.5,
    lineHeight: 32,
  },

  unit: {
    fontSize: font.size.xs,
    color: colors.text.muted,
    marginBottom: 2,
  },

  label: {
    fontSize: 9,
    fontWeight: font.weight.semibold,
    color: colors.text.muted,
    letterSpacing: font.letterSpacing.wide,
  },
});

const chipStyles = StyleSheet.create({
  chip: {
    alignItems: "center",
    gap: 2,
  },

  label: {
    fontSize: 9,
    fontWeight: font.weight.semibold,
    letterSpacing: 0.5,
  },

  value: {
    fontSize: font.size.md,
    fontWeight: font.weight.medium,
    color: colors.text.primary,
  },
});
