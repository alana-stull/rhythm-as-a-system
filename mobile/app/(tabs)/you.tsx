import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import {
  type Area,
  createGoal,
  createHelp,
  createRhythm,
  deleteGoal,
  deleteHelp,
  deleteRhythm,
  getReflection,
  listAreas,
  listGoals,
  listHelps,
  listRhythms,
  type Goal,
  type Help,
  type Reflection,
  type Rhythm,
} from "../../src/api/endpoints";
import { useSession } from "../../src/auth/SessionProvider";
import {
  BottomSheet,
  Button,
  Card,
  DarkCallout,
  Icon,
  Screen,
  TagChip,
  Text,
  TextField,
  color,
  minTouch,
  radius,
  space,
} from "../../src/design";
import { toTag } from "../../src/lib/tags";

type Kind = "goal" | "rhythm" | "help";
const FIELDS: Record<Kind, { title: string; fields: { placeholder: string; label: string }[] }> = {
  goal: { title: "Add a goal", fields: [{ placeholder: "What are you working toward?", label: "Goal" },
                                        { placeholder: "A detail or deadline (optional)", label: "Detail" }] },
  rhythm: { title: "Add a rhythm", fields: [{ placeholder: "Name the rhythm", label: "Rhythm" },
                                            { placeholder: "How often? (optional)", label: "How often" }] },
  help: { title: "Add what helps", fields: [{ placeholder: "What helps?", label: "What helps" }] },
};
const GOALS_SHOWN = 2;

function RemoveButton({ label, onPress, tint = color.muted }: { label: string; onPress: () => void; tint?: string }) {
  return (
    <Pressable onPress={onPress} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Remove ${label}`}
               style={styles.remove}>
      <Icon name="close" size={13} color={tint} />
    </Pressable>
  );
}

// Small text action; hitSlop keeps the touch target at 44pt without padding out the row.
function AddAction({ label, text = "+ Add", onPress, tint = color.amberText }: {
  label: string; text?: string; onPress: () => void; tint?: string;
}) {
  return (
    <Pressable onPress={onPress} hitSlop={12} accessibilityRole="button" accessibilityLabel={label}
               style={({ pressed }) => [styles.add, pressed && { opacity: 0.6 }]}>
      <Text variant="metaStrong" color={tint}>{text}</Text>
    </Pressable>
  );
}

// Full-width list card: heading and + Add on one row, then entries or a short empty line.
function ListCard({ title, empty, rows, addLabel, onAdd, onRemove }: {
  title: string; empty: string; rows: { id: string; title: string; detail?: string | null }[];
  addLabel: string; onAdd: () => void; onRemove: (id: string) => void;
}) {
  return (
    <Card>
      <View style={[styles.row, { marginBottom: 4 }]}>
        <Text variant="section" accessibilityRole="header" style={{ flex: 1 }}>{title}</Text>
        <AddAction label={addLabel} onPress={onAdd} />
      </View>
      {rows.length === 0 ? (
        <Text variant="meta" color={color.muted}>{empty}</Text>
      ) : rows.map((r) => (
        <View key={r.id} style={styles.entry}>
          <View style={{ flex: 1 }}>
            <Text>{r.title}</Text>
            {r.detail ? <Text variant="meta" color={color.muted}>{r.detail}</Text> : null}
          </View>
          <RemoveButton label={r.title} onPress={() => onRemove(r.id)} />
        </View>
      ))}
    </Card>
  );
}

export default function You() {
  const router = useRouter();
  const { profile } = useSession();
  const { fontScale } = useWindowDimensions();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [rhythms, setRhythms] = useState<Rhythm[]>([]);
  const [helps, setHelps] = useState<Help[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [reflection, setReflection] = useState<Reflection | null>(null);
  const [allGoals, setAllGoals] = useState(false);
  const [adding, setAdding] = useState<Kind | null>(null);
  const [values, setValues] = useState(["", ""]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [g, r, h, a] = await Promise.all([listGoals(), listRhythms(), listHelps(), listAreas()]);
      setGoals(g); setRhythms(r); setHelps(h); setAreas(a);
      setError(null);
      // Optional: if it fails, the card just stays hidden.
      getReflection().then(setReflection, () => setReflection(null));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load this page.");
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const remove = (fn: () => Promise<unknown>) => async () => {
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "That didn't save."); }
    load();
  };

  const openAdd = (kind: Kind) => { setValues(["", ""]); setAdding(kind); };
  const save = async () => {
    if (!adding || !values[0].trim()) return;
    setBusy(true);
    try {
      const [a, b] = values.map((v) => v.trim());
      if (adding === "goal") await createGoal(a, b);
      if (adding === "rhythm") await createRhythm(a, b);
      if (adding === "help") await createHelp(a);
      setAdding(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save.");
    } finally {
      setBusy(false);
    }
  };

  const first = profile?.display_name?.trim().split(/\s+/)[0] ?? "";
  // At larger text sizes Settings drops to its icon so the name keeps its room.
  const compactSettings = fontScale > 1.3;
  const shownGoals = allGoals ? goals : goals.slice(0, GOALS_SHOWN);

  const header = (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        {first ? <Text variant="question" accessibilityRole="header">{first}</Text> : null}
        <Text variant="meta" color={color.muted}>Your space, shaped around you.</Text>
      </View>
      <Pressable onPress={() => router.push("/settings")} accessibilityRole="button" accessibilityLabel="Settings" hitSlop={6}
                 style={({ pressed }) => [styles.settings, compactSettings && styles.settingsIcon, pressed && { opacity: 0.75 }]}>
        <Icon name="settings" size={15} color={color.ink} />
        {!compactSettings && <Text variant="metaStrong">Settings</Text>}
      </Pressable>
    </View>
  );

  return (
    <Screen gap={space.md} header={header}>
      {error && <Text variant="meta" color="#6B2F2A">{error}</Text>}

      {/* Goals, in Today's "What matters now" callout. */}
      <DarkCallout eyebrow="What I'm making space for">
        {shownGoals.map((g) => (
          <View key={g.id} style={styles.entry}>
            <View style={{ flex: 1 }}>
              <Text color={color.onInk}>{g.title}</Text>
              {g.notes ? <Text variant="meta" color={color.onInkMuted}>{g.notes}</Text> : null}
            </View>
            <RemoveButton label={g.title} onPress={remove(() => deleteGoal(g.id))} tint={color.onInkMuted} />
          </View>
        ))}
        <View style={[styles.row, { marginTop: 6, gap: space.md }]}>
          <AddAction label="Add a goal" text="+ Add a goal" onPress={() => openAdd("goal")} tint={color.amberLight} />
          {goals.length > GOALS_SHOWN && (
            <Pressable onPress={() => setAllGoals((v) => !v)} accessibilityRole="button" hitSlop={12} style={styles.add}>
              <Text variant="metaStrong" color={color.onInkMuted}>
                {allGoals ? "Show fewer" : `Show all ${goals.length}`}
              </Text>
            </Pressable>
          )}
        </View>
      </DarkCallout>

      <ListCard title="Everyday rhythms" empty="Small things that ground your days."
                rows={rhythms.map((r) => ({ id: r.id, title: r.title, detail: r.cadence_note }))}
                addLabel="Add a rhythm" onAdd={() => openAdd("rhythm")}
                onRemove={(id) => remove(() => deleteRhythm(id))()} />
      <ListCard title="What helps me" empty="What supports your capacity."
                rows={helps.map((h) => ({ id: h.id, title: h.text }))}
                addLabel="Add what helps" onAdd={() => openAdd("help")}
                onRemove={(id) => remove(() => deleteHelp(id))()} />

      <Pressable onPress={() => router.push("/settings")} accessibilityRole="button"
                 accessibilityLabel={`Areas I want to focus on: ${areas.map((a) => a.name).join(", ") || "none yet"}`}
                 accessibilityHint="Manage your areas in Settings">
        <Card>
          <View style={styles.row}>
            <Text variant="section" style={{ flex: 1 }}>Areas I want to focus on</Text>
            <Icon name="chevronRight" size={16} color={color.muted} />
          </View>
          {areas.length > 0 && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: space.xs }}>
              {areas.map((a) => { const t = toTag(a); return t ? <TagChip key={a.id} tag={t} /> : null; })}
            </View>
          )}
        </Card>
      </Pressable>

      {/* Pinned to the bottom of the screen, just above the tab bar, when the page is short. */}
      {reflection?.text && (
        <Card style={{ marginTop: "auto" }}>
          <Text variant="eyebrow" color={color.muted} accessibilityRole="header" style={{ marginBottom: 4 }}>
            Your week, in reflection
          </Text>
          <Text>{reflection.text}</Text>
        </Card>
      )}

      <BottomSheet visible={!!adding} onClose={() => setAdding(null)} title={adding ? FIELDS[adding].title : undefined}>
        {adding && (
          <View style={{ gap: space.xs }}>
            {FIELDS[adding].fields.map((f, i) => (
              <TextField key={f.label} value={values[i]} placeholder={f.placeholder} accessibilityLabel={f.label}
                         autoFocus={i === 0} onChangeText={(v) => setValues((xs) => xs.map((x, j) => (j === i ? v : x)))} />
            ))}
            <Button label={busy ? "Saving…" : "Add"} fullWidth disabled={busy || !values[0].trim()} onPress={save}
                    style={{ marginTop: space.sm }} />
            <Button label="Cancel" variant="secondary" fullWidth onPress={() => setAdding(null)} />
          </View>
        )}
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: space.sm },
  settings: {
    flexDirection: "row", alignItems: "center", gap: 6, minHeight: 36, paddingHorizontal: 12,
    borderRadius: radius.pill, borderWidth: 1, borderColor: color.borderStrong,
  },
  settingsIcon: { minWidth: minTouch, minHeight: minTouch, paddingHorizontal: 0, justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: space.xs },
  entry: { flexDirection: "row", alignItems: "center", gap: 6 },
  add: { minHeight: 24, justifyContent: "center" },
  remove: { minWidth: 32, minHeight: 36, alignItems: "center", justifyContent: "center" },
});
