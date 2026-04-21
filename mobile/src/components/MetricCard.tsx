import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { cardBase, colors, font, space } from "../theme";

type Metric = "recovery" | "exposure";

interface MetricCardProps {
  metric: Metric;
  value: number | null;
  loading?: boolean;
}

const CONFIG: Record<Metric, { label: string; sublabel: string; dotColor: string }> = {
  recovery: {
    label:    "Recovery",
    sublabel: "Oura readiness",
    dotColor: colors.ring.recovery,
  },
  exposure: {
    label:    "Exposure",
    sublabel: "Calendar load",
    dotColor: colors.ring.exposure,
  },
};

export function MetricCard({ metric, value, loading = false }: MetricCardProps) {
  const { label, sublabel, dotColor } = CONFIG[metric];
  const hasValue = value != null;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
        <Text style={styles.label}>{label.toUpperCase()}</Text>
      </View>

      <Text style={styles.sublabel}>{sublabel}</Text>

      {loading ? (
        <View style={styles.skeleton} />
      ) : (
        <Text style={[styles.number, !hasValue && styles.numberNull]}>
          {hasValue ? Math.round(value!) : "—"}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    ...cardBase,
    flex: 1,
    padding: space[10],
    minHeight: 108,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    marginBottom: 3,
  },

  dot: {
    width: 6,
    height: 6,
    borderRadius: 9999,
  },

  label: {
    fontSize: font.size.micro,
    fontWeight: font.weight.semibold,
    color: colors.text.muted,
    letterSpacing: font.letterSpacing.wide,
  },

  sublabel: {
    fontSize: font.size.tiny,
    color: colors.text.faint,
    marginBottom: space[6],
  },

  number: {
    fontSize: font.size.display,
    fontWeight: font.weight.light,
    color: colors.text.primary,
    letterSpacing: -1,
    lineHeight: 44,
  },

  numberNull: {
    color: colors.text.muted,
    fontWeight: font.weight.regular,
  },

  skeleton: {
    height: 44,
    width: 64,
    backgroundColor: "#F0F0EE",
    borderRadius: 8,
  },
});
