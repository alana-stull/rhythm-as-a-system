import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import {
  type Area,
  clearPriority,
  createBlock,
  createTaskWith,
  getPlan,
  listAreas,
  listTasks,
  makePriority,
  type Plan as PlanData,
  setCompleted,
} from "../../src/api/endpoints";
import type { Task } from "../../src/api/types";
import {
  BottomSheet,
  Button,
  Card,
  Check,
  Icon,
  Screen,
  ScreenHeader,
  SegmentedControl,
  Text,
  TextField,
  color,
  minTouch,
  pastel,
  radius,
  space,
} from "../../src/design";
import { addDays, clock, iso } from "../../src/lib/dates";
import { toTag } from "../../src/lib/tags";

type Group = "today" | "week" | "later";
type Mode = "focus" | "area";

// Where a task shows up comes from its dates (no status column): focused or due
// today (or overdue) → Needs attention today; within the next 7 days → Coming up; else Can wait.
function groupOf(t: Task, today: string, weekEnd: string): Group {
  const date = [t.focus_on, t.due_on].filter(Boolean).sort()[0] as string | undefined;
  if (!date) return "later";
  if (date <= today) return "today";
  return date <= weekEnd ? "week" : "later";
}

const minutesBetween = (a: Date, b: Date) => Math.round((+b - +a) / 60000);

function hoursText(min: number) {
  const h = Math.floor(min / 60), m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} hour${h === 1 ? "" : "s"}`;
}

function dueText(t: Task, today: string): string | null {
  if (!t.due_on) return null;
  if (t.due_on < today) return "Overdue";
  if (t.due_on === today) return "Due today";
  return `Due ${new Date(t.due_on + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" })}`;
}

export default function Tasks() {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [plan, setPlan] = useState<PlanData | null>(null);
  const [mode, setMode] = useState<Mode>("focus");
  const [showLater, setShowLater] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [planning, setPlanning] = useState<Task | null>(null);
  const [title, setTitle] = useState("");
  const [tagId, setTagId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const today = iso(new Date());
  const weekEnd = iso(addDays(new Date(), 7));

  const load = useCallback(async () => {
    try {
      const [t, a, p] = await Promise.all([listTasks(), listAreas(), getPlan(iso(new Date()), 1)]);
      setTasks(t);
      setAreas(a);
      setPlan(p);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load tasks.");
    } finally {
      setLoaded(true);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const byId = useMemo(() => Object.fromEntries(areas.map((a) => [a.id, a])), [areas]);
  const windows = plan?.open_windows ?? null;            // null: no fresh calendar, so open time is unknown
  const openMinutes = (windows ?? []).reduce((n, w) => n + minutesBetween(new Date(w.starts_at), new Date(w.ends_at)), 0);
  const plannedToday = (plan?.items ?? []).filter((i) => i.kind === "task").length;

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

  // Same scheduling as Plan's open windows: the task's estimate (or an hour), capped by the window.
  const planInto = (t: Task, w: { starts_at: string; ends_at: string }) => {
    setPlanning(null);
    const s = new Date(w.starts_at);
    const length = Math.min(minutesBetween(s, new Date(w.ends_at)), t.estimate_minutes ?? 60);
    act((ts) => ts, () => createBlock({ kind: "task", task_id: t.id, starts_at: s.toISOString(),
                                        ends_at: new Date(+s + length * 60000).toISOString() }));
  };

  const row = (t: Task) => {
    const area = t.area_id ? byId[t.area_id] : undefined;
    const tag = area ? toTag(area) : undefined;
    const starred = t.priority_rank !== null && t.focus_on === today;
    const meta = [mode === "focus" ? area?.name : null, dueText(t, today),
                  t.estimate_minutes ? `about ${t.estimate_minutes} min` : null].filter(Boolean).join(", ");
    const done = !!t.completed_at;
    return (
      <View key={t.id} style={styles.row}>
        <Pressable onPress={() => act(
                     (ts) => ts.map((x) => (x.id === t.id ? { ...x, completed_at: x.completed_at ? null : new Date().toISOString() } : x)),
                     () => setCompleted(t.id, !t.completed_at))}
                   accessibilityRole="checkbox" accessibilityState={{ checked: done }} accessibilityLabel={t.title}
                   style={styles.rowMain}>
          <View style={{ paddingTop: 2 }}><Check checked={done} /></View>
          <View style={{ flex: 1 }}>
            <Text style={{ textDecorationLine: done ? "line-through" : "none" }} color={done ? color.muted : color.ink}>{t.title}</Text>
            {!!meta && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                {tag && mode === "focus" && <View style={[styles.areaDot, { backgroundColor: pastel[tag.color].text }]} />}
                <Text variant="meta" color={color.muted} style={{ flexShrink: 1 }}>{meta}</Text>
              </View>
            )}
          </View>
        </Pressable>
        <Pressable onPress={() => act((ts) => ts, () => (starred ? clearPriority(t.id) : makePriority(t.id)))}
                   hitSlop={8} accessibilityRole="button" accessibilityState={{ selected: starred }}
                   accessibilityLabel={starred ? `Remove ${t.title} from today's priorities` : `Make ${t.title} a priority today`}
                   style={styles.iconBtn}>
          <Icon name="star" size={16} color={starred ? color.amber : color.borderStrong} filled={starred} />
        </Pressable>
        {!done && (
          <Pressable onPress={() => setPlanning(t)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Plan ${t.title}`}
                     style={styles.planIt}>
            <Text variant="metaStrong" color={color.amberText}>Plan it</Text>
          </Pressable>
        )}
      </View>
    );
  };

  const section = (title: string, items: Task[], empty: string, accent?: string) => (
    <View key={title}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 }}>
        {accent && <View style={[styles.areaDot, { width: 9, height: 9, borderRadius: 5, backgroundColor: accent }]} />}
        <Text variant="section" accessibilityRole="header">{title}</Text>
      </View>
      {items.length ? items.map(row) : <Text variant="meta" color={color.muted} style={{ paddingVertical: 8 }}>{loaded ? empty : "Loading…"}</Text>}
    </View>
  );

  const groups = { today: [] as Task[], week: [] as Task[], later: [] as Task[] };
  tasks.forEach((t) => groups[groupOf(t, today, weekEnd)].push(t));

  const addButton = (
    <Pressable onPress={() => setSheet(true)} accessibilityRole="button" accessibilityLabel="Add task"
               style={({ pressed }) => [styles.addBtn, pressed && { backgroundColor: color.cacaoPress }]}>
      <Icon name="plus" size={22} color={color.onInk} strokeWidth={2.3} />
    </Pressable>
  );

  return (
    <Screen header={<ScreenHeader title="Tasks" right={addButton} />} gap={space.lg}>
      <SegmentedControl<Mode> stretch value={mode} onChange={setMode}
                              options={[{ key: "focus", label: "Focus" }, { key: "area", label: "By area" }]} />
      {error && <Text variant="meta" color="#6B2F2A">{error}</Text>}

      {mode === "focus" ? (
        <>
          <Card>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: space.xs }}>
              <Text variant="bodyStrong">Open time today</Text>
              {windows && windows.length > 0 && (
                <Text variant="meta" color={color.muted}>{clock(windows[0].starts_at)} to {clock(windows[0].ends_at)}</Text>
              )}
            </View>
            <Text variant="meta" color={color.muted} style={{ marginTop: 6 }}>
              {windows === null
                ? "No calendar is connected, so Rhythm can't see your open time. You can still place any task in Plan by choosing a time yourself."
                : windows.length === 0
                  ? "No open stretches left today."
                  : `${hoursText(openMinutes)} open${windows.length > 1 ? ` across ${windows.length} stretches` : ""}. ${
                    plannedToday ? `${plannedToday} task${plannedToday === 1 ? "" : "s"} planned so far.` : "Nothing is planned yet."}`}
            </Text>
          </Card>

          {section("Needs attention today", groups.today, "Nothing due or planned for today.")}
          {section("Coming up", groups.week, "Nothing with a due date this week.")}

          <View>
            <Pressable onPress={() => setShowLater((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: showLater }}
                       style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: minTouch }}>
              <Text variant="section" accessibilityRole="header">Can wait</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text variant="meta" color={color.muted}>{groups.later.length}</Text>
                <Icon name={showLater ? "chevronDown" : "chevronRight"} size={16} color={color.muted} />
              </View>
            </Pressable>
            {showLater && groups.later.map(row)}
          </View>
        </>
      ) : (
        <>
          {areas.map((a) => {
            const tag = toTag(a);
            return section(a.name, tasks.filter((t) => t.area_id === a.id), "Nothing here.", tag ? pastel[tag.color].text : undefined);
          })}
          {tasks.some((t) => !t.area_id || !byId[t.area_id]) &&
            section("No area", tasks.filter((t) => !t.area_id || !byId[t.area_id]), "Nothing here.", color.muted)}
        </>
      )}

      <BottomSheet visible={sheet} onClose={() => setSheet(false)} title="New task">
        <View style={{ gap: space.xs }}>
          <TextField value={title} onChangeText={setTitle} placeholder="What needs doing?" accessibilityLabel="Task" autoFocus
                     returnKeyType="done" onSubmitEditing={add} />
          {areas.length > 0 && (
            <>
              <Text variant="eyebrow" color={color.muted} style={{ marginTop: space.sm }}>Area</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {areas.map((a) => {
                  const tag = toTag(a);
                  if (!tag) return null;
                  const p = pastel[tag.color];
                  const on = tagId === a.id;
                  return (
                    <Pressable key={a.id} onPress={() => setTagId(on ? null : a.id)} accessibilityRole="radio" accessibilityState={{ selected: on }}
                               style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.tag, backgroundColor: p.bg,
                                        borderWidth: 2, borderColor: on ? color.cacao : "transparent", minHeight: 36, justifyContent: "center" }}>
                      <Text variant="tag" color={p.text}>{a.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}
          <Button label="Add task" fullWidth disabled={!title.trim()} onPress={add} style={{ marginTop: space.md }} />
          <Button label="Cancel" variant="secondary" fullWidth onPress={() => setSheet(false)} />
        </View>
      </BottomSheet>

      <BottomSheet visible={!!planning} onClose={() => setPlanning(null)} kicker="Plan it" title={planning?.title}>
        {planning && (
          <View style={{ gap: space.xs }}>
            {windows && windows.length > 0 ? (
              <>
                <Text variant="meta" color={color.muted} style={{ marginBottom: 4 }}>Open today. Pick a stretch.</Text>
                {windows.map((w) => (
                  <Button key={w.starts_at} variant="secondary" fullWidth onPress={() => planInto(planning, w)}
                          label={`${clock(w.starts_at)} to ${clock(w.ends_at)}  ·  ${hoursText(minutesBetween(new Date(w.starts_at), new Date(w.ends_at)))}`} />
                ))}
              </>
            ) : (
              <Text style={{ marginBottom: space.xs }}>
                {windows === null
                  ? "Rhythm can't see your open time without a calendar. You can place this in Plan by choosing a time yourself."
                  : "No open stretches left today. You can place this in Plan on another day."}
              </Text>
            )}
            <Button label="Open Plan" variant={windows && windows.length ? "ghost" : "primary"} fullWidth={!(windows && windows.length)}
                    onPress={() => { setPlanning(null); router.navigate("/plan"); }}
                    style={windows && windows.length ? { alignSelf: "center", marginTop: space.xs } : undefined} />
          </View>
        )}
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: 4, borderBottomWidth: 1, borderBottomColor: color.divider },
  rowMain: { flex: 1, flexDirection: "row", alignItems: "flex-start", gap: 14, paddingVertical: 12, minHeight: minTouch },
  iconBtn: { minWidth: 32, minHeight: minTouch, alignItems: "center", justifyContent: "center" },
  planIt: { minHeight: minTouch, justifyContent: "center", paddingLeft: 4 },
  areaDot: { width: 7, height: 7, borderRadius: 4 },
  addBtn: { width: 46, height: 46, borderRadius: 13, backgroundColor: color.cacao, alignItems: "center", justifyContent: "center" },
});
