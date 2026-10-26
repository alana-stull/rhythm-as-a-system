import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import {
  type Area,
  createGoal,
  createHelp,
  createRhythm,
  deleteGoal,
  deleteHelp,
  deleteRhythm,
  getInsights,
  getReflection,
  type Goal,
  type Help,
  type Insights as InsightsData,
  listAreas,
  listGoals,
  listHelps,
  listRhythms,
  type Reflection,
  type Rhythm,
} from "../../src/api/endpoints";
import {
  BottomSheet,
  Button,
  DarkCallout,
  Icon,
  Screen,
  ScreenHeader,
  TagChip,
  Text,
  TextField,
  color,
  minTouch,
  space,
  stateColor,
} from "../../src/design";
import { iso } from "../../src/lib/dates";
import { toTag } from "../../src/lib/tags";

// v7 "You, option 2": a compact index. The bigger picture and "Worth noticing" only restate what Rhythm
// already has (this month's breakdown, the weekly reflection, evidence-backed patterns); the three
// personal sections are one-line summaries that open a sheet for editing.

type Sheet = "matters" | "supports" | "areas" | null;
const MIN_FOR_PATTERN = 5; // same threshold as the Insights summary: fewer assessed days, no generalizing

function summarize(names: string[], max = 2) {
  if (!names.length) return "";
  if (names.length <= max) return names.join(", ");
  return `${names.slice(0, max).join(", ")} and ${names.length - max} more`;
}

function RemoveButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Remove ${label}`} style={styles.remove}>
      <Icon name="close" size={14} color={color.muted} />
    </Pressable>
  );
}

// A sheet row: generous height, a divider, title with optional detail, remove on the right.
function SheetRow({ title, detail, onRemove }: { title: string; detail?: string | null; onRemove: () => void }) {
  return (
    <View style={styles.sheetRow}>
      <View style={{ flex: 1 }}>
        <Text>{title}</Text>
        {detail ? <Text variant="meta" color={color.muted}>{detail}</Text> : null}
      </View>
      <RemoveButton label={title} onPress={onRemove} />
    </View>
  );
}

// Inline add: one or two fields and an Add button, at the end of a sheet section.
function AddRow({ placeholders, onAdd }: { placeholders: [string, string?]; onAdd: (a: string, b: string) => Promise<void> }) {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!a.trim()) return;
    setBusy(true);
    try { await onAdd(a.trim(), b.trim()); setA(""); setB(""); } finally { setBusy(false); }
  };
  return (
    <View style={{ gap: space.xs, marginTop: space.sm }}>
      <View style={{ flexDirection: "row", gap: space.xs }}>
        <TextField value={a} onChangeText={setA} placeholder={placeholders[0]} accessibilityLabel={placeholders[0]}
                   returnKeyType="done" onSubmitEditing={submit} style={{ flex: 1 }} />
        <Button label={busy ? "…" : "Add"} disabled={busy || !a.trim()} onPress={submit} />
      </View>
      {placeholders[1] && a.trim().length > 0 && (
        <TextField value={b} onChangeText={setB} placeholder={placeholders[1]} accessibilityLabel={placeholders[1]} />
      )}
    </View>
  );
}

export default function You() {
  const router = useRouter();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [rhythms, setRhythms] = useState<Rhythm[]>([]);
  const [helps, setHelps] = useState<Help[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [month, setMonth] = useState<InsightsData | null>(null);
  const [reflection, setReflection] = useState<Reflection | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const now = new Date();
      const [g, r, h, a] = await Promise.all([listGoals(), listRhythms(), listHelps(), listAreas()]);
      setGoals(g); setRhythms(r); setHelps(h); setAreas(a);
      setError(null);
      // Optional context; if either fails, its part of the page simply stays quiet.
      getInsights(iso(new Date(now.getFullYear(), now.getMonth(), 1)), iso(now)).then(setMonth, () => setMonth(null));
      getReflection().then(setReflection, () => setReflection(null));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load this page.");
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const change = (fn: () => Promise<unknown>) => async () => {
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "That didn't save."); }
    load();
  };

  // ── Your bigger picture: this month so far, stated plainly ──────────────────
  const b = month?.breakdown;
  const monthName = new Date().toLocaleDateString("en-US", { month: "long" });
  const checkins = (month?.days ?? []).filter((d) => d.checked_in).length;
  const most = b?.states[0];
  const enough = !!b && b.assessed_days >= MIN_FOR_PATTERN && !!most;
  const bigHeadline = enough
    ? `${monthName} has most often been ${most!.state}.`
    : b && b.assessed_days > 0 ? `Rhythm is still learning your ${monthName}.` : "Rhythm is still getting to know you.";
  const bigDetail = enough
    ? `${most!.days} of ${b!.days_so_far} days ${most!.state}. From ${checkins} check-in${checkins === 1 ? "" : "s"}.`
    : b && b.assessed_days > 0 ? `From ${checkins} check-in${checkins === 1 ? "" : "s"} so far.` : "For now it only uses what you tell it.";

  // ── Worth noticing: only things Rhythm can point to ─────────────────────────
  const noticing: { label: string; tone: string; title: string; body?: string }[] = [
    ...(reflection?.text ? [{ label: "This week", tone: stateColor.Aligned.text, title: reflection.text }] : []),
    ...(month?.patterns ?? []).map((p) => ({ label: "Keep an eye on", tone: stateColor.Strained.text, title: p.title, body: p.body })),
  ];

  const supportsNames = [...rhythms.map((r) => r.title), ...helps.map((h) => h.text)];
  const index: { key: Exclude<Sheet, null>; label: string; value: string; empty: string }[] = [
    { key: "matters", label: "What matters to me", value: summarize(goals.map((g) => g.title), 1), empty: "Add something you want to make room for" },
    { key: "supports", label: "What supports me", value: summarize(supportsNames), empty: "Routines and things that help you" },
    { key: "areas", label: "Areas of my life", value: summarize(areas.map((a) => a.name), 3), empty: "Add the parts of life you organize around" },
  ];

  const settings = (
    <Pressable onPress={() => router.push("/settings")} accessibilityRole="button" accessibilityLabel="Settings" hitSlop={8}
               style={{ minWidth: minTouch, minHeight: minTouch, alignItems: "flex-end", justifyContent: "center" }}>
      <Icon name="settings" size={22} color={color.muted} />
    </Pressable>
  );

  return (
    <Screen gap={space.lg} header={<ScreenHeader title="You" right={settings} />}>
      {error && <Text variant="meta" color="#6B2F2A">{error}</Text>}

      <DarkCallout eyebrow="Your bigger picture">
        <Text variant="section" color={color.onInk}>{bigHeadline}</Text>
        <Text variant="meta" color={color.onInkMuted} style={{ marginTop: 8 }}>{bigDetail}</Text>
      </DarkCallout>

      <View>
        <Text variant="section" accessibilityRole="header" style={{ marginBottom: 2 }}>Worth noticing</Text>
        {noticing.length ? noticing.map((n, i) => (
          <View key={i} style={styles.noticeRow} accessible accessibilityLabel={`${n.label}. ${n.title} ${n.body ?? ""}`}>
            <Text variant="eyebrow" color={n.tone} style={{ width: 96 }}>{n.label}</Text>
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">{n.title}</Text>
              {n.body ? <Text variant="meta" color={color.muted} style={{ marginTop: 2 }}>{n.body}</Text> : null}
            </View>
          </View>
        )) : (
          <Text variant="meta" color={color.muted} style={{ paddingVertical: space.xs }}>
            Nothing to show yet. Items appear only when Rhythm can see them in your data or you record them.
          </Text>
        )}
      </View>

      <View>
        {index.map((row) => (
          <Pressable key={row.key} onPress={() => setSheet(row.key)} accessibilityRole="button"
                     accessibilityLabel={`${row.label}: ${row.value || row.empty}`} accessibilityHint="Opens to view and edit"
                     style={({ pressed }) => [styles.indexRow, pressed && { opacity: 0.7 }]}>
            <View style={{ flex: 1 }}>
              <Text variant="eyebrow" color={color.muted}>{row.label}</Text>
              <Text variant={row.value ? "section" : "body"} color={row.value ? color.ink : color.muted} numberOfLines={1}
                    style={{ marginTop: 4 }}>{row.value || row.empty}</Text>
            </View>
            <Icon name="chevronRight" size={18} color={color.muted} />
          </Pressable>
        ))}
      </View>

      {/* What matters to me: longer-term things to make room for (goals), not tasks. */}
      <BottomSheet visible={sheet === "matters"} onClose={() => setSheet(null)} kicker="What matters to me" title="What I'm making room for">
        <ScrollView style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled">
          <Text variant="meta" color={color.muted} style={{ marginBottom: space.xs }}>
            Longer-term things you want room for. They shape the suggestions you see. Nothing here is required.
          </Text>
          {goals.map((g) => <SheetRow key={g.id} title={g.title} detail={g.notes} onRemove={change(() => deleteGoal(g.id))} />)}
          <AddRow placeholders={["Add something that matters", "A detail or date (optional)"]}
                  onAdd={async (a, d) => { await change(() => createGoal(a, d))(); }} />
        </ScrollView>
        <Button label="Done" variant="secondary" fullWidth onPress={() => setSheet(null)} style={{ marginTop: space.md }} />
      </BottomSheet>

      {/* What supports me: routines and conditions that protect capacity. */}
      <BottomSheet visible={sheet === "supports"} onClose={() => setSheet(null)} kicker="What supports me" title="What helps you keep room">
        <ScrollView style={{ maxHeight: 520 }} keyboardShouldPersistTaps="handled">
          <Text variant="eyebrow" color={color.muted} style={{ marginBottom: 2 }}>Everyday rhythms</Text>
          {rhythms.map((r) => <SheetRow key={r.id} title={r.title} detail={r.cadence_note} onRemove={change(() => deleteRhythm(r.id))} />)}
          <AddRow placeholders={["Add a rhythm", "How often? (optional)"]} onAdd={async (a, c) => { await change(() => createRhythm(a, c))(); }} />
          <Text variant="eyebrow" color={color.muted} style={{ marginTop: space.lg, marginBottom: 2 }}>What helps</Text>
          {helps.map((h) => <SheetRow key={h.id} title={h.text} onRemove={change(() => deleteHelp(h.id))} />)}
          <AddRow placeholders={["Add what helps"]} onAdd={async (a) => { await change(() => createHelp(a))(); }} />
        </ScrollView>
        <Button label="Done" variant="secondary" fullWidth onPress={() => setSheet(null)} style={{ marginTop: space.md }} />
      </BottomSheet>

      {/* Areas of my life: the categories commitments, tasks and time are organized by (managed in Settings). */}
      <BottomSheet visible={sheet === "areas"} onClose={() => setSheet(null)} kicker="Areas of my life" title="How your time is organized">
        <Text variant="meta" color={color.muted} style={{ marginBottom: space.sm }}>
          The parts of life your commitments, tasks and time are sorted into.
        </Text>
        {areas.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {areas.map((a) => { const t = toTag(a); return t ? <TagChip key={a.id} tag={t} /> : null; })}
          </View>
        ) : <Text color={color.muted}>No areas yet.</Text>}
        <Button label="Manage areas in Settings" variant="secondary" fullWidth style={{ marginTop: space.lg }}
                onPress={() => { setSheet(null); router.push("/settings"); }} />
        <Button label="Done" variant="ghost" onPress={() => setSheet(null)} style={{ alignSelf: "center", marginTop: space.sm }} />
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  noticeRow: { flexDirection: "row", gap: space.sm, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: color.divider },
  indexRow: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: 14, minHeight: minTouch + 20,
              borderBottomWidth: 1, borderBottomColor: color.divider },
  sheetRow: { flexDirection: "row", alignItems: "center", gap: space.xs, paddingVertical: 14, minHeight: minTouch + 12,
              borderBottomWidth: 1, borderBottomColor: color.divider },
  remove: { minWidth: minTouch, minHeight: minTouch, alignItems: "center", justifyContent: "center" },
});
