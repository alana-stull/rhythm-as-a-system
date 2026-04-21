import React from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { cardBase, colors, font, space } from "../theme";
import { StateBadge } from "./StateBadge";

interface RhythmCardProps {
  condition: string | null;
  reflection: string | null;
  bullets: string[];
  loading?: boolean;
  generating?: boolean;
  onGenerate?: () => void;
}

export function RhythmCard({
  condition,
  reflection,
  bullets,
  loading = false,
  generating = false,
  onGenerate,
}: RhythmCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.sectionLabel}>YOUR RHYTHM</Text>

      {loading ? (
        <View style={styles.skeletonGroup}>
          <View style={[styles.skeleton, { width: 110, height: 30, marginBottom: space[5] }]} />
          <View style={[styles.skeleton, { width: "100%", height: 13, marginBottom: 6 }]} />
          <View style={[styles.skeleton, { width: "80%",  height: 13 }]} />
        </View>
      ) : (
        <>
          {condition ? (
            <View style={styles.badgeRow}>
              <StateBadge condition={condition} />
            </View>
          ) : (
            <Text style={styles.emptyHint}>
              Import wearable data to see your rhythm state.
            </Text>
          )}

          {generating ? (
            <View style={styles.generatingRow}>
              <ActivityIndicator size="small" color={colors.text.muted} />
              <Text style={styles.generatingText}>Getting your rhythm…</Text>
            </View>
          ) : reflection ? (
            <Text style={styles.reflection}>{reflection}</Text>
          ) : null}

          {!generating && bullets.length > 0 && (
            <>
              <View style={styles.divider} />
              <Text style={styles.approachLabel}>SUGGESTED APPROACH</Text>
              {bullets.map((bullet, i) => (
                <View key={i} style={styles.bulletRow}>
                  <Text style={styles.bulletDot}>•</Text>
                  <Text style={styles.bulletText}>{bullet}</Text>
                </View>
              ))}
            </>
          )}

          {onGenerate && !generating && (
            <TouchableOpacity
              onPress={onGenerate}
              style={styles.generateBtn}
              activeOpacity={0.7}
            >
              <Text style={styles.generateBtnText}>
                {reflection ? "Regenerate" : "Generate insight"}
              </Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    ...cardBase,
    padding: space[14],
    paddingBottom: space[12],
  },

  sectionLabel: {
    fontSize: font.size.micro,
    fontWeight: font.weight.semibold,
    color: colors.text.muted,
    letterSpacing: font.letterSpacing.wide,
    marginBottom: space[10],
  },

  badgeRow: {
    marginBottom: space[10],
  },

  emptyHint: {
    fontSize: font.size.base,
    color: colors.text.faint,
    lineHeight: 22,
    marginBottom: space[4],
  },

  generatingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[4],
    marginBottom: space[4],
  },

  generatingText: {
    fontSize: font.size.base,
    color: colors.text.muted,
    fontStyle: "italic",
  },

  reflection: {
    fontSize: font.size.base,
    color: "#4A4A4A",
    lineHeight: 22,
  },

  divider: {
    height: 0.5,
    backgroundColor: colors.divider,
    marginVertical: space[8],
  },

  approachLabel: {
    fontSize: font.size.micro,
    fontWeight: font.weight.semibold,
    color: colors.text.muted,
    letterSpacing: font.letterSpacing.wide,
    marginBottom: space[5],
  },

  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space[5],
    marginBottom: 6,
  },

  bulletDot: {
    fontSize: font.size.base,
    color: "#C0C0BC",
    marginTop: 2,
    lineHeight: 22,
  },

  bulletText: {
    flex: 1,
    fontSize: font.size.base,
    color: "#4A4A4A",
    lineHeight: 22,
  },

  generateBtn: {
    marginTop: space[8],
    alignSelf: "flex-start",
    paddingVertical: 7,
    paddingHorizontal: space[8],
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },

  generateBtnText: {
    fontSize: font.size.sm,
    fontWeight: font.weight.medium,
    color: colors.text.secondary,
  },

  skeletonGroup: {
    gap: 0,
  },

  skeleton: {
    backgroundColor: "#F0F0EE",
    borderRadius: 6,
  },
});
