import { useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import {
  type Area,
  clearPriority,
  createTaskWith,
  listAreas,
  listTasks,
  makePriority,
  setCompleted,
} from "../../src/api/endpoints";
import type { Task } from "../../src/api/types";
import {
  BottomSheet,
  Button,
  Card,
  ChecklistRow,
  FAB,
  Screen,
  ScreenHeader,
  Text,
  TextField,
  color,
  pastel,
  radius,
  space,
} from "../../src/design";
import { addDays, iso } from "../../src/lib/dates";
import { toTag } from "../../src/lib/tags";

type Group = "today" | "week" | "later";
const GROUPS: { key: Group; label: string }[] = [
  { key: "today", label: "Today" }, { key: "week", label: "This week" }, { key: "later", label: "Later" },
];

// Where a task shows up comes from its dates (no status column): focused or due
// today (or overdue) → Today; within the next 7 days → This week; else Later.
function groupOf(t: Task, today: string, weekEnd: string): Group {
  const date = [t.focus_on, t.due_on].filter(Boolean).sort()[0] as string | undefined;
  if (!date) return "later";
  if (date <= today) return "today";
  return date <= weekEnd ? "week" : "later";
}

function FilterChip({ label, active, bg, fg, onPress }: { label: string; active: boolean; bg?: string; fg?: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: active }}
               style={{ paddingVertical: 7, paddingHorizontal: 12, borderRadius: radius.tag, minHeight: 34, justifyContent: "center",
                        backgroundColor: active ? color.ink : bg ?? "transparent",
                        borderWidth: 1, borderColor: active ? color.ink : bg ? bg : "rgba(27,27,29,0.14)" }}>
      <Text variant="tag" color={active ? color.onInk : fg ?? color.muted}>{label}</Text>
    </Pressable>
  );
}

export default function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [sheet, setSheet] = useState(false);
  const [title, setTitle] = useState("");
  const [tagId, setTagId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const [t, a] = await Promise.all([listTasks(), listAreas()]);
      setTasks(t);
      setAreas(a);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load tasks.");
    } finally {
      setLoaded(true);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const byId = useMemo(() => Object.fromEntries(areas.map((a) => [a.id, a])), [areas]);
  const today = iso(new Date());
  const weekEnd = iso(addDays(new Date(), 7));
  const visible = tasks.filter((t) => filter === "all" || (filter === "none" ? !t.area_id : t.area_id === filter));

  const act = async (optimistic: (ts: Task[]) => Task[], call: () => Promise<unknown>) => {
    setTasks(optimistic);
    setError(null);
    try {
      await call();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save.");
    }
    load();
  };

  const add = async () => {
    const t = title.trim();
    if (!t) return;
    setSheet(false);
    setTitle("");
    setTagId(null);
    await act((ts) => ts, () => createTaskWith({ title: t, area_id: tagId }));
  };

  return (
    <Screen header={<ScreenHeader title="Tasks" />} gap={space.lg} overlay={<FAB onPress={() => setSheet(true)} accessibilityLabel="Add task" />}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.gutter }}
                  contentContainerStyle={{ gap: 7, paddingHorizontal: space.gutter }}>
        <FilterChip label="All" active={filter === "all"} onPress={() => setFilter("all")} />
        {areas.map((a) => {
          const p = a.color_family && a.color_family in pastel ? pastel[a.color_family as keyof typeof pastel] : undefined;
          return <FilterChip key={a.id} label={a.name} active={filter === a.id} bg={p?.bg} fg={p?.text} onPress={() => setFilter(a.id)} />;
        })}
      </ScrollView>

      {error && <Text variant="meta" color="#6B2F2A">{error}</Text>}

      {GROUPS.map((g) => {
        const items = visible.filter((t) => groupOf(t, today, weekEnd) === g.key);
        return (
          <View key={g.key}>
            <Text variant="eyebrow" color={color.muted} style={{ marginBottom: 6 }} accessibilityRole="header">{g.label}</Text>
            <Card padding="list">
              {items.length === 0 && (
                <Text variant="meta" color={color.muted} style={{ padding: space.sm }}>
                  {loaded ? "Nothing here." : "Loading…"}
                </Text>
              )}
              {items.map((t) => (
                <ChecklistRow
                  key={t.id}
                  label={t.title}
                  checked={!!t.completed_at}
                  tag={t.area_id ? toTag(byId[t.area_id]) : undefined}
                  starred={t.priority_rank !== null && t.focus_on === today}
                  onToggle={() => act(
                    (ts) => ts.map((x) => (x.id === t.id ? { ...x, completed_at: x.completed_at ? null : new Date().toISOString() } : x)),
                    () => setCompleted(t.id, !t.completed_at))}
                  onStar={() => act(
                    (ts) => ts,
                    () => (t.priority_rank !== null && t.focus_on === today ? clearPriority(t.id) : makePriority(t.id)))}
                />
              ))}
            </Card>
          </View>
        );
      })}

      <BottomSheet visible={sheet} onClose={() => setSheet(false)} title="Add task">
        <TextField value={title} onChangeText={setTitle} placeholder="What needs doing?" accessibilityLabel="Task" autoFocus
                   returnKeyType="done" onSubmitEditing={add} />
        {areas.length > 0 && (
          <>
            <Text variant="eyebrow" color={color.muted} style={{ marginTop: space.md, marginBottom: space.xs }}>Tag</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {areas.map((a) => {
                const tag = toTag(a);
                if (!tag) return null;
                const p = pastel[tag.color];
                const on = tagId === a.id;
                return (
                  <Pressable key={a.id} onPress={() => setTagId(on ? null : a.id)} accessibilityRole="radio" accessibilityState={{ selected: on }}
                             style={{ paddingVertical: 7, paddingHorizontal: 12, borderRadius: radius.tag, backgroundColor: p.bg,
                                      borderWidth: 2, borderColor: on ? color.ink : "transparent" }}>
                    <Text variant="tag" color={p.text}>{a.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}
        <Button label="Add task" fullWidth disabled={!title.trim()} onPress={add} style={{ marginTop: space.lg }} />
        <Button label="Cancel" variant="secondary" fullWidth onPress={() => setSheet(false)} style={{ marginTop: space.xs }} />
      </BottomSheet>
    </Screen>
  );
}
