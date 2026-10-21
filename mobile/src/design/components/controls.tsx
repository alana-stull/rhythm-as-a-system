import React from "react";
import { Pressable, StyleSheet, Switch, View } from "react-native";
import { Icon } from "../icons";
import { color as c, elevation, minTouch, PastelKey, pastel, pastelKeys, radius, space } from "../tokens";
import { Tag, TagChip } from "./status";
import { Text } from "./Text";

// ── Check (round for tasks/priorities, square for multi-pick lists) ─────────
export function Check({ checked, shape = "circle" }: { checked: boolean; shape?: "circle" | "square" }) {
  return (
    <View
      style={[
        styles.check,
        shape === "square" && { borderRadius: 5 },
        { borderColor: checked ? c.amber : c.borderStrong, backgroundColor: checked ? c.amber : "transparent" },
      ]}
    >
      {checked && <Icon name="check" size={11} color={c.onInk} strokeWidth={3} />}
    </View>
  );
}

// ── Checklist row (Today priorities, Tasks, first-day picks) ──────────────────
type ChecklistRowProps = {
  label: string;
  checked: boolean;
  onToggle: () => void;
  shape?: "circle" | "square";
  tag?: Tag;
  starred?: boolean;
  onStar?: () => void;
  onRemove?: () => void;
};

export function ChecklistRow({ label, checked, onToggle, shape, tag, starred, onStar, onRemove }: ChecklistRowProps) {
  return (
    <View style={styles.row}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel={label}
        style={styles.rowMain}
      >
        <Check checked={checked} shape={shape} />
        <Text
          style={{ flex: 1, textDecorationLine: checked ? "line-through" : "none" }}
          color={checked ? c.muted : c.ink}
        >
          {label}
        </Text>
      </Pressable>
      {tag && <TagChip tag={tag} size="sm" />}
      {onStar && (
        <Pressable
          onPress={onStar}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityState={{ selected: !!starred }}
          accessibilityLabel={starred ? `Remove ${label} from priorities` : `Make ${label} a priority`}
          style={styles.iconBtn}
        >
          <Icon name="star" size={17} color={starred ? c.amber : c.borderStrong} filled={starred} />
        </Pressable>
      )}
      {onRemove && (
        <Pressable onPress={onRemove} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Remove ${label}`} style={styles.iconBtn}>
          <Icon name="close" size={14} color={c.muted} />
        </Pressable>
      )}
    </View>
  );
}

// ── Option row (single or multi select) ───────────────────────────────────────
export function OptionRow({
  label,
  selected,
  onPress,
  multi = false,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  multi?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={multi ? "checkbox" : "radio"}
      accessibilityState={multi ? { checked: selected } : { selected }}
      style={[styles.option, { borderColor: selected ? c.amber : "rgba(27,27,29,0.14)" }]}
    >
      <Text style={{ flex: 1 }}>{label}</Text>
      {selected && <Icon name="check" size={17} color={c.amber} strokeWidth={2.6} />}
    </Pressable>
  );
}

// ── Collapsed question (answered onboarding / check-in question) ─────────────
export function CollapsedQuestionRow({ question, answer, onPress }: { question: string; answer: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${question} Answer: ${answer}`}
      accessibilityHint="Change your answer"
      style={styles.collapsed}
    >
      <View style={{ flex: 1 }}>
        <Text variant="meta" color={c.muted}>{question}</Text>
        <Text variant="bodyStrong">{answer}</Text>
      </View>
      <Icon name="chevronDown" size={16} color={c.muted} strokeWidth={2.2} />
    </Pressable>
  );
}

// ── Five-point scale (energy, demand, rested) ─────────────────────────────────
// Fills up to the chosen step. Each step has a word, so VoiceOver reads "Low,
// 2 of 5" rather than a number.
type ScaleProps = {
  value: number | null;
  onChange: (v: number) => void;
  stepLabels: [string, string, string, string, string];
  accessibilityLabel: string;
};

export function ScaleSelector({ value, onChange, stepLabels, accessibilityLabel }: ScaleProps) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      <View style={styles.scale}>
        {stepLabels.map((word, i) => {
          const n = i + 1;
          const active = value === n;
          const filled = value !== null && n <= value; // fills up to the choice, like a level
          return (
            <Pressable
              key={n}
              onPress={() => onChange(n)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${word}, ${n} of 5`}
              style={[styles.scaleStep, { backgroundColor: filled ? c.amber : c.surface, borderColor: filled ? c.amber : "rgba(27,27,29,0.15)" }]}
            />
          );
        })}
      </View>
      <View style={styles.scaleEnds} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Text variant="meta" color={c.muted}>{stepLabels[0]}</Text>
        <Text variant="meta" color={c.muted}>{stepLabels[4]}</Text>
      </View>
    </View>
  );
}

// ── Segmented control (Day / Week / Month) ────────────────────────────────────
export function SegmentedControl<K extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: K; label: string }[];
  value: K;
  onChange: (k: K) => void;
}) {
  return (
    <View style={styles.segTrack} accessibilityRole="tablist">
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={[styles.seg, active && styles.segActive]}
          >
            <Text variant="metaStrong" color={active ? c.ink : c.muted}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Pastel picker (new tag) ───────────────────────────────────────────────────
export function PastelPicker({ value, onChange }: { value: PastelKey | null; onChange: (k: PastelKey) => void }) {
  return (
    <View style={styles.pastels} accessibilityRole="radiogroup" accessibilityLabel="Tag color">
      {pastelKeys.map((k) => {
        const active = value === k;
        return (
          <Pressable
            key={k}
            onPress={() => onChange(k)}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={pastel[k].label}
            hitSlop={4}
            style={[styles.swatch, { backgroundColor: pastel[k].bg }, active ? styles.swatchActive : styles.swatchIdle]}
          />
        );
      })}
    </View>
  );
}

// ── Toggle row (Settings) ─────────────────────────────────────────────────────
export function ToggleRow({ label, detail, value, onChange }: { label: string; detail?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong">{label}</Text>
        {detail && <Text variant="meta" color={c.muted}>{detail}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: c.amber, false: "rgba(27,27,29,0.18)" }}
        ios_backgroundColor="rgba(27,27,29,0.18)"
        accessibilityLabel={label}
      />
    </View>
  );
}

// ── Floating add button ───────────────────────────────────────────────────────
export function FAB({ onPress, accessibilityLabel }: { onPress: () => void; accessibilityLabel: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}
    >
      <Icon name="plus" size={22} color={c.onInk} strokeWidth={2.3} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  check: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  row: { flexDirection: "row", alignItems: "center", gap: space.xs, paddingHorizontal: space.xs },
  rowMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, minHeight: minTouch, paddingVertical: 8 },
  iconBtn: { minWidth: 32, minHeight: minTouch, alignItems: "center", justifyContent: "center" },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: minTouch + 4,
    paddingVertical: 13,
    paddingHorizontal: 15,
    borderRadius: radius.option,
    borderWidth: 1,
    backgroundColor: c.white,
    marginBottom: space.xs,
  },
  collapsed: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(27,27,29,0.1)",
    paddingTop: 14,
    paddingBottom: 6,
    minHeight: minTouch,
  },
  scale: { flexDirection: "row", gap: 6 },
  scaleStep: { flex: 1, height: minTouch, borderRadius: 9, borderWidth: 1 },
  scaleEnds: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  segTrack: { flexDirection: "row", backgroundColor: c.segmentTrack, borderRadius: 9, padding: 2, alignSelf: "flex-start" },
  seg: { minHeight: 32, paddingHorizontal: 12, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  segActive: { backgroundColor: c.white },
  pastels: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  swatch: { width: 36, height: 36, borderRadius: 9 },
  swatchIdle: { borderWidth: 1, borderColor: "rgba(27,27,29,0.1)" },
  swatchActive: { borderWidth: 2, borderColor: c.ink },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: 12, minHeight: minTouch },
  fab: {
    position: "absolute",
    right: 22,
    bottom: 22,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: c.ink,
    alignItems: "center",
    justifyContent: "center",
    ...elevation.fab,
  },
});
