import React from "react";
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { Icon } from "../icons";
import { CapacityDisplay, color as c, PastelKey, pastel, radius, space, stateColor } from "../tokens";
import { Text } from "./Text";
import { Button } from "./primitives";

// ── State badge ───────────────────────────────────────────────────────────────
// A pill (pills are reserved for capacity). Always a word plus, where known, a
// source label ("self-reported", "check-in + Oura"). `Insufficient` renders as a
// dashed outline with no dot and can be tapped to start a check-in.
const DEFAULT_LABEL: Partial<Record<CapacityDisplay, string>> = {
  Insufficient: "Still getting to know your day",
};

type StateBadgeProps = {
  style?: StyleProp<ViewStyle>; // e.g. { alignSelf: "center" } when the badge sits in a row
  state: CapacityDisplay;
  source?: string;
  label?: string;
  size?: "md" | "sm";
  onPress?: () => void;
};

export function StateBadge({ state, source, label, size = "md", onPress, style }: StateBadgeProps) {
  const col = stateColor[state];
  const isEmpty = state === "Insufficient";
  const text = label ?? DEFAULT_LABEL[state] ?? state;
  const sm = size === "sm";
  const a11y = `Capacity: ${text}${source ? `, ${source}` : ""}`;

  const body = (
    <View
      style={[
        styles.badge,
        sm && styles.badgeSm,
        isEmpty ? styles.badgeEmpty : { backgroundColor: col.soft },
      ]}
    >
      {!isEmpty && <View style={[styles.dot, sm && styles.dotSm, { backgroundColor: col.base }]} />}
      <Text variant={isEmpty ? "meta" : sm ? "metaStrong" : "badge"} color={isEmpty ? c.muted : col.text}>
        {text}
      </Text>
      {source && !isEmpty && (
        <Text variant="meta" color={c.muted} style={sm && { fontSize: 12 }}>· {source}</Text>
      )}
    </View>
  );

  if (!onPress) {
    return <View accessible accessibilityLabel={a11y} style={[styles.wrap, style]}>{body}</View>;
  }
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y} style={[styles.wrap, style]}>
      {body}
    </Pressable>
  );
}

// ── Tag chip ──────────────────────────────────────────────────────────────────
// A rounded rectangle, never a pill, so it can't be mistaken for a state badge.
export type Tag = { id: string; name: string; color: PastelKey };

export function TagChip({ tag, size = "md", onRemove }: { tag: Tag; size?: "sm" | "md"; onRemove?: () => void }) {
  const p = pastel[tag.color];
  const sm = size === "sm";
  return (
    <View
      style={[styles.tag, sm && styles.tagSm, { backgroundColor: p.bg }]}
      accessible={!onRemove}
      accessibilityLabel={`Tag: ${tag.name}`}
    >
      <Text variant="tag" color={p.text} style={sm && { fontSize: 11, lineHeight: 14 }}>{tag.name}</Text>
      {onRemove && (
        <Pressable onPress={onRemove} hitSlop={12} accessibilityRole="button" accessibilityLabel={`Remove ${tag.name}`}>
          <Icon name="close" size={11} color={p.text} strokeWidth={2.4} />
        </Pressable>
      )}
    </View>
  );
}

// ── Connection row (Settings → Connections, onboarding → Connect) ────────────
// Shows live status, not just "linked". Oura's six states come from the
// Settings board; `connections.status` + `last_synced_at` drive them.
export type ConnectionTone = "working" | "ok" | "waiting" | "delayed" | "error" | "off";

export const connectionToneColor: Record<ConnectionTone, string> = {
  working: c.amber,
  ok: "#4F6B4A",
  waiting: c.muted,
  delayed: c.amber,
  error: "#A8524B",
  off: "#938C7F",
};

type ConnectionRowProps = {
  name: string;
  status?: { label: string; tone: ConnectionTone };
  detail: string;
  action?: { label: string; onPress?: () => void; variant?: "primary" | "secondary"; disabled?: boolean };
};

export function ConnectionRow({ name, status, detail, action }: ConnectionRowProps) {
  return (
    <View style={styles.conn}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong">{name}</Text>
        {status && (
          <View style={styles.connStatus}>
            <View style={[styles.connDot, { backgroundColor: connectionToneColor[status.tone] }]} />
            <Text variant="metaStrong">{status.label}</Text>
          </View>
        )}
        <Text variant="meta" color={c.muted}>{detail}</Text>
      </View>
      {action && (
        <Button
          size="sm"
          label={action.label}
          onPress={action.onPress}
          disabled={action.disabled}
          variant={action.variant ?? "primary"}
          accessibilityHint={`${action.label} ${name}`}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: "flex-start" },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 7,
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingHorizontal: 13,
  },
  badgeSm: { paddingVertical: 4, paddingHorizontal: 10, gap: 5 },
  badgeEmpty: { borderWidth: 1, borderStyle: "dashed", borderColor: c.dashed, backgroundColor: c.surface },
  dot: { width: 7, height: 7, borderRadius: 4 },
  dotSm: { width: 6, height: 6, borderRadius: 3 },
  // No alignSelf: in a row the chip follows the row's alignment (centered).
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: radius.tag,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  tagSm: { borderRadius: 5, paddingVertical: 2, paddingHorizontal: 7 },
  conn: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: radius.option,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.hairline,
  },
  connStatus: { flexDirection: "row", alignItems: "center", gap: 6 },
  connDot: { width: 7, height: 7, borderRadius: 4 },
});
