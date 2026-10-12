import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Pressable, View } from "react-native";
import {
  type Area,
  createGoal,
  createHelp,
  createRhythm,
  deleteGoal,
  deleteHelp,
  deleteRhythm,
  listAreas,
  listGoals,
  listHelps,
  listRhythms,
  type Goal,
  type Help,
  type Rhythm,
} from "../../src/api/endpoints";
import { useSession } from "../../src/auth/SessionProvider";
import { Button, Card, Icon, Screen, ScreenHeader, TagChip, Text, TextField, color, minTouch, space } from "../../src/design";
import { toTag } from "../../src/lib/tags";

type Row = { id: string; title: string; detail?: string | null };

// One "You" section: serif heading, + Add, a hint, an inline add form and the list.
function Section({ title, hint, empty, rows, fields, onAdd, onRemove }: {
  title: string; hint: string; empty: string; rows: Row[];
  fields: { placeholder: string; label: string }[];
  onAdd: (values: string[]) => Promise<void>; onRemove: (id: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<string[]>(fields.map(() => ""));
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!values[0].trim()) return;
    setBusy(true);
    try {
      await onAdd(values.map((v) => v.trim()));
      setValues(fields.map(() => ""));
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };
  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
        <Text variant="section" accessibilityRole="header">{title}</Text>
        <Button variant="ghost" label={open ? "Cancel" : "+ Add"} onPress={() => setOpen((o) => !o)} />
      </View>
      <Text variant="meta" color={color.muted} style={{ marginTop: 2, marginBottom: space.xs }}>{hint}</Text>
      <Card padding="list">
        {open && (
          <View style={{ padding: space.xs, gap: space.xs }}>
            {fields.map((f, i) => (
              <TextField key={f.label} value={values[i]} placeholder={f.placeholder} accessibilityLabel={f.label} autoFocus={i === 0}
                         onChangeText={(v) => setValues((xs) => xs.map((x, j) => (j === i ? v : x)))} />
            ))}
            <Button label="Add" size="sm" disabled={busy || !values[0].trim()} onPress={submit} style={{ alignSelf: "flex-start" }} />
          </View>
        )}
        {rows.length === 0 && !open && <Text variant="meta" color={color.muted} style={{ padding: space.sm }}>{empty}</Text>}
        {rows.map((r) => (
          <View key={r.id} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, paddingHorizontal: space.sm }}>
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">{r.title}</Text>
              {r.detail ? <Text variant="meta" color={color.muted}>{r.detail}</Text> : null}
            </View>
            <Pressable onPress={() => onRemove(r.id)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Remove ${r.title}`}
                       style={{ minWidth: 32, minHeight: minTouch, alignItems: "center", justifyContent: "center" }}>
              <Icon name="close" size={14} color={color.muted} />
            </Pressable>
          </View>
        ))}
      </Card>
    </View>
  );
}

export default function You() {
  const router = useRouter();
  const { profile } = useSession();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [rhythms, setRhythms] = useState<Rhythm[]>([]);
  const [helps, setHelps] = useState<Help[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [g, r, h, a] = await Promise.all([listGoals(), listRhythms(), listHelps(), listAreas()]);
      setGoals(g); setRhythms(r); setHelps(h); setAreas(a);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load your profile.");
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const run = (fn: () => Promise<unknown>) => async () => {
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "That didn't save."); }
    load();
  };

  const name = profile?.display_name ?? "";
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "·";

  return (
    <Screen
      gap={space.lg}
      header={<ScreenHeader title="You" right={<Button size="sm" variant="secondary" label="Settings" onPress={() => router.push("/settings")} />} />}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: color.amberSoft, alignItems: "center", justifyContent: "center" }}
              accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Text variant="section" color={color.amberText}>{initials}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="section">{name}</Text>
          {profile?.email ? <Text variant="meta" color={color.muted}>{profile.email}</Text> : null}
        </View>
      </View>
      {error && <Text variant="meta" color="#6B2F2A">{error}</Text>}

      <Section title="What I'm making space for" hint="What you're actually working toward right now."
               empty="Nothing here yet — add what you're working toward."
               rows={goals.map((g) => ({ id: g.id, title: g.title, detail: g.notes }))}
               fields={[{ placeholder: "What are you working toward?", label: "Goal" },
                        { placeholder: "A detail or deadline (optional)", label: "Detail" }]}
               onAdd={async ([t, n]) => { await createGoal(t, n); load(); }}
               onRemove={(id) => run(() => deleteGoal(id))()} />

      <Section title="My everyday rhythms" hint="The small, steady things — not a streak, just a rhythm."
               empty="No rhythms added yet."
               rows={rhythms.map((r) => ({ id: r.id, title: r.title, detail: r.cadence_note }))}
               fields={[{ placeholder: "Name the rhythm", label: "Rhythm" }, { placeholder: "How often?", label: "How often" }]}
               onAdd={async ([t, c]) => { await createRhythm(t, c); load(); }}
               onRemove={(id) => run(() => deleteRhythm(id))()} />

      <View>
        <Text variant="section" accessibilityRole="header">The parts of my life</Text>
        <Text variant="meta" color={color.muted} style={{ marginTop: 2, marginBottom: space.xs }}>
          Shows up as color on Today, Plan, and Tasks.
        </Text>
        <Card>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {areas.map((a) => { const t = toTag(a); return t ? <TagChip key={a.id} tag={t} /> : null; })}
            {areas.length === 0 && <Text variant="meta" color={color.muted}>No tags yet.</Text>}
          </View>
          <Text variant="meta" color={color.muted} style={{ marginTop: space.sm }}>Add or rename these from Settings.</Text>
        </Card>
      </View>

      <Section title="What helps me feel my best" hint="Things you've told Rhythm — never a guess on our part."
               empty="Nothing added yet."
               rows={helps.map((h) => ({ id: h.id, title: h.text }))}
               fields={[{ placeholder: "What helps?", label: "What helps" }]}
               onAdd={async ([t]) => { await createHelp(t); load(); }}
               onRemove={(id) => run(() => deleteHelp(id))()} />
    </Screen>
  );
}
