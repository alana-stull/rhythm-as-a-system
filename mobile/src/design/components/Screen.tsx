import React from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Icon } from "../icons";
import { color as c, minTouch, space } from "../tokens";
import { Text } from "./Text";

// ── Screen ────────────────────────────────────────────────────────────────────
// Cream background, top safe area, 20pt gutters. The tab bar owns the bottom
// inset. `overlay` renders outside the scroll view (FABs). `gap` is the space
// between top-level sections.
export function Screen({
  header,
  children,
  scroll = true,
  overlay,
  gap = space.sm,
  refreshing,
  onRefresh,
}: {
  header?: React.ReactNode;
  children: React.ReactNode;
  scroll?: boolean;
  overlay?: React.ReactNode;
  gap?: number;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      {header && <View style={styles.header}>{header}</View>}
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.content, { gap }]}
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={c.muted} /> : undefined}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, { flex: 1, gap }]}>{children}</View>
      )}
      {overlay}
    </SafeAreaView>
  );
}

// ── Screen header ─────────────────────────────────────────────────────────────
export function ScreenHeader({
  title,
  overline,
  back,
  right,
}: {
  title: string;
  overline?: string;
  back?: { label: string; onPress: () => void };
  right?: React.ReactNode;
}) {
  return (
    <View>
      {back && (
        <Pressable
          onPress={back.onPress}
          accessibilityRole="button"
          accessibilityLabel={`Back to ${back.label}`}
          hitSlop={8}
          style={styles.back}
        >
          <Icon name="chevronLeft" size={16} color={c.muted} strokeWidth={2.2} />
          <Text variant="metaStrong" color={c.muted}>{back.label}</Text>
        </Pressable>
      )}
      {overline && <Text variant="meta" color={c.muted}>{overline}</Text>}
      <View style={styles.titleRow}>
        <Text variant="title" accessibilityRole="header" style={{ flexShrink: 1 }}>{title}</Text>
        {right}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.cream },
  header: { paddingHorizontal: space.gutter, paddingTop: space.xs, paddingBottom: space.sm },
  content: { paddingHorizontal: space.gutter, paddingBottom: space.xxl, gap: space.sm },
  back: { flexDirection: "row", alignItems: "center", gap: 2, minHeight: minTouch - 12, alignSelf: "flex-start" },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
});
