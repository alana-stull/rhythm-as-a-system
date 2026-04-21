import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Suggestion, generateSuggestion, getLatestScores, getLatestSuggestion } from "../api/client";
import { StateBadge } from "../components/StateBadge";
import { cardBase, colors, font, radius, space } from "../theme";

export function BreakScreen() {
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [condition, setCondition] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchInitial = useCallback(async () => {
    setError(null);
    try {
      const [scoreRes, suggRes] = await Promise.allSettled([getLatestScores(), getLatestSuggestion()]);
      if (scoreRes.status === "fulfilled") setCondition(scoreRes.value.condition);
      if (suggRes.status === "fulfilled") setSuggestion(suggRes.value);
    } catch {
      setError("Could not load break suggestion.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchInitial(); }, [fetchInitial]);

  async function handleGenerate() {
    if (generating) return;
    setGenerating(true);
    setError(null);
    try {
      const sg = await generateSuggestion();
      setSuggestion(sg);
    } catch {
      setError("Generation failed. Is the backend running?");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
    >
      <Text style={styles.pageTitle}>Microbreak</Text>
      <Text style={styles.pageSubtitle}>
        A moment to reset, guided by your current state.
      </Text>

      {/* ── Current state pill ── */}
      {condition && !loading && (
        <View style={styles.stateRow}>
          <Text style={styles.stateLabel}>CURRENT STATE</Text>
          <StateBadge condition={condition} />
        </View>
      )}

      {/* ── Main content ── */}
      {loading ? (
        <View style={styles.loadingCard}>
          <ActivityIndicator color={colors.text.muted} />
        </View>
      ) : error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : generating ? (
        <View style={styles.loadingCard}>
          <ActivityIndicator color={colors.text.muted} />
          <Text style={styles.generatingText}>Crafting your break…</Text>
        </View>
      ) : suggestion ? (
        <>
          {/* Reflection */}
          <View style={styles.reflectionCard}>
            <Text style={styles.reflectionLabel}>REFLECTION</Text>
            <Text style={styles.reflectionText}>{suggestion.reflection}</Text>
          </View>

          {/* Bullets */}
          {suggestion.bullets.length > 0 && (
            <View style={styles.bulletsCard}>
              <Text style={styles.bulletsLabel}>TRY THIS</Text>
              {suggestion.bullets.map((b, i) => (
                <View key={i} style={styles.bulletRow}>
                  <View style={styles.bulletNumber}>
                    <Text style={styles.bulletNumberText}>{i + 1}</Text>
                  </View>
                  <Text style={styles.bulletText}>{b}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Timestamp */}
          <Text style={styles.timestamp}>
            Generated{" "}
            {new Date(suggestion.generated_at).toLocaleTimeString("en-US", {
              hour: "numeric", minute: "2-digit",
            })}
          </Text>
        </>
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>
            No break suggestion yet. Generate one below.
          </Text>
        </View>
      )}

      {/* ── Generate button ── */}
      {!loading && (
        <TouchableOpacity
          onPress={handleGenerate}
          style={[styles.generateBtn, generating && styles.generateBtnDisabled]}
          activeOpacity={0.75}
          disabled={generating}
        >
          <Text style={styles.generateBtnText}>
            {generating ? "Generating…" : suggestion ? "New break" : "Generate break"}
          </Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },

  content: {
    padding: space[12],
    paddingBottom: space[24],
  },

  pageTitle: {
    fontSize: font.size.title,
    fontWeight: font.weight.medium,
    color: colors.text.primary,
    letterSpacing: -0.3,
    marginBottom: space[2],
  },

  pageSubtitle: {
    fontSize: font.size.base,
    color: colors.text.secondary,
    lineHeight: 22,
    marginBottom: space[10],
  },

  stateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[6],
    marginBottom: space[10],
  },

  stateLabel: {
    fontSize: font.size.micro,
    fontWeight: font.weight.semibold,
    color: colors.text.muted,
    letterSpacing: font.letterSpacing.wide,
  },

  loadingCard: {
    ...cardBase,
    padding: space[16],
    alignItems: "center",
    gap: space[6],
    marginBottom: space[6],
  },

  generatingText: {
    fontSize: font.size.base,
    color: colors.text.muted,
    fontStyle: "italic",
  },

  errorCard: {
    backgroundColor: "#FCEAEB",
    borderRadius: radius.lg,
    padding: space[8],
    marginBottom: space[6],
  },

  errorText: {
    fontSize: font.size.base,
    color: "#8A2030",
    textAlign: "center",
  },

  reflectionCard: {
    ...cardBase,
    padding: space[12],
    marginBottom: space[5],
  },

  reflectionLabel: {
    fontSize: font.size.micro,
    fontWeight: font.weight.semibold,
    color: colors.text.muted,
    letterSpacing: font.letterSpacing.wide,
    marginBottom: space[6],
  },

  reflectionText: {
    fontSize: font.size.lg,
    fontWeight: font.weight.light,
    color: colors.text.primary,
    lineHeight: 26,
    letterSpacing: -0.2,
  },

  bulletsCard: {
    ...cardBase,
    padding: space[12],
    marginBottom: space[5],
  },

  bulletsLabel: {
    fontSize: font.size.micro,
    fontWeight: font.weight.semibold,
    color: colors.text.muted,
    letterSpacing: font.letterSpacing.wide,
    marginBottom: space[8],
  },

  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space[6],
    marginBottom: space[6],
  },

  bulletNumber: {
    width: 22,
    height: 22,
    borderRadius: radius.full,
    backgroundColor: colors.bg.primary,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 1,
  },

  bulletNumberText: {
    fontSize: font.size.xs,
    fontWeight: font.weight.semibold,
    color: colors.text.secondary,
  },

  bulletText: {
    flex: 1,
    fontSize: font.size.base,
    color: "#4A4A4A",
    lineHeight: 22,
  },

  timestamp: {
    fontSize: font.size.xs,
    color: colors.text.muted,
    textAlign: "center",
    marginBottom: space[10],
  },

  emptyCard: {
    ...cardBase,
    padding: space[16],
    alignItems: "center",
    marginBottom: space[8],
  },

  emptyText: {
    fontSize: font.size.base,
    color: colors.text.muted,
    textAlign: "center",
    lineHeight: 22,
  },

  generateBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: space[7],
    alignItems: "center",
  },

  generateBtnDisabled: {
    opacity: 0.5,
  },

  generateBtnText: {
    fontSize: font.size.base,
    fontWeight: font.weight.semibold,
    color: colors.text.inverse,
    letterSpacing: 0.2,
  },
});
