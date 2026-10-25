import { useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { AppState, Pressable, StyleSheet, View } from "react-native";
import {
  type Area,
  createBlock,
  deleteBlock,
  getPlan,
  listAreas,
  type Plan as PlanData,
  type PlanItem,
  setCompleted,
  updateBlock,
  updateTask,
} from "../../src/api/endpoints";
import {
  BottomSheet,
  Button,
  Card,
  CapacityDisplay,
  Check,
  FAB,
  Icon,
  MonthGrid,
  Screen,
  ScreenHeader,
  SegmentedControl,
  StateBadge,
  TagChip,
  Text,
  TextField,
  color,
  minTouch,
  radius,
  space,
  stateColor,
} from "../../src/design";
import { syncThen } from "../../src/integrations/autoSync";
import { useEventTitles } from "../../src/integrations/calendar";
import { addDays, clock, clockAmPm, fromIso, iso, startOfWeek } from "../../src/lib/dates";
import { toTag } from "../../src/lib/tags";
import { BlockEditor } from "../../src/plan/BlockEditor";

type View_ = "day" | "week" | "month";
const START_HOUR = 7, END_HOUR = 22, ROW = 56; // v7: roomier hours so a 45-minute block fits two lines

type Block = {
  key: string; kind: PlanItem["kind"] | "open"; title: string; sub: string; start: Date; end: Date;
  item?: PlanItem; window?: { starts_at: string; ends_at: string };
};
type Placed = Block & { col: number; cols: number };

// Overlapping blocks sit side by side (columns per overlap cluster), as on the Plan board.
function layout(blocks: Block[]): Placed[] {
  const sorted = [...blocks].sort((a, b) => +a.start - +b.start || +a.end - +b.end);
  const out: Placed[] = [];
  let active: { col: number; end: number }[] = [];
  let cluster: Placed[] = [];
  const close = () => { const n = Math.max(0, ...cluster.map((p) => p.col)) + 1; cluster.forEach((p) => (p.cols = n)); cluster = []; };
  for (const b of sorted) {
    active = active.filter((a) => a.end > +b.start);
    if (!active.length) close();
    const used = active.map((a) => a.col);
    let col = 0;
    while (used.includes(col)) col++;
    const placed = { ...b, col, cols: 1 };
    active.push({ col, end: +b.end });
    cluster.push(placed);
    out.push(placed);
  }
  close();
  return out;
}

const hourLabel = (h: number) => (h === 12 ? "12p" : h > 12 ? `${h - 12}p` : `${h}a`);
const minutesBetween = (a: Date, b: Date) => Math.round((+b - +a) / 60000);

export default function Plan() {
  const [view, setView] = useState<View_>("day");
  const [date, setDate] = useState(() => new Date());
  const [data, setData] = useState<PlanData | null>(null);
  const [areas, setAreas] = useState<Record<string, Area>>({});
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Block | null>(null);
  const [editor, setEditor] = useState<{ open: boolean; editing: PlanItem | null }>({ open: false, editing: null });

  const today = new Date();
  const isToday = iso(date) === iso(today);
  const [rangeStart, rangeDays] = useMemo<[Date, number]>(() => {
    if (view === "day") return [date, 1];
    if (view === "week") return [startOfWeek(date), 7];
    const first = new Date(date.getFullYear(), date.getMonth(), 1);
    return [first, new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()];
  }, [view, date]);

  const load = useCallback(async (): Promise<void> => {
    try {
      await syncThen(4000, () => { load(); });  // current calendar events before drawing the day
      const [p, a] = await Promise.all([getPlan(iso(rangeStart), rangeDays), listAreas()]);
      setData(p);
      setAreas(Object.fromEntries(a.map((x) => [x.id, x])));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load your plan.");
    }
  }, [rangeStart, rangeDays]);
  useFocusEffect(useCallback(() => {
    load();
    // Back from the background (say, after adding an event in Calendar): sync and redraw.
    const sub = AppState.addEventListener("change", (st) => st === "active" && load());
    return () => sub.remove();
  }, [load]));

  const titles = useEventTitles(data?.items ?? []);
  const titleOf = (i: PlanItem) =>
    i.title ?? titles[i.external_id ?? ""] ?? (i.kind === "protected" ? "Protected" : i.kind === "calendar" ? "Busy" : "Untitled");

  const run = async (fn: () => Promise<unknown>) => {
    setSelected(null);
    setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "That didn't save."); }
    load();
  };

  // ── Week strip (Day and Week): selected day in cacao, today ringed in amber ──
  const weekStart = startOfWeek(date);
  const weekStrip = (
    <View style={{ flexDirection: "row", gap: 4 }}>
      {Array.from({ length: 7 }, (_, i) => {
        const d = addDays(weekStart, i);
        const active = iso(d) === iso(date);
        const isTodayCell = iso(d) === iso(today);
        const has = (data?.items ?? []).some((it) => iso(new Date(it.starts_at)) === iso(d))
          || (data?.tasks ?? []).some((t) => (t.focus_on ?? t.due_on) === iso(d));
        return (
          <Pressable key={i} onPress={() => setDate(d)} accessibilityRole="button" accessibilityState={{ selected: active }}
                     accessibilityLabel={d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                     style={{ flex: 1, alignItems: "center", gap: 4 }}>
            <Text variant="meta" color={color.muted}>{d.toLocaleDateString("en-US", { weekday: "narrow" })}</Text>
            <View style={[styles.stripDay, isTodayCell && !active && styles.stripToday, active && styles.stripActive]}>
              <Text variant="bodyStrong" color={active ? color.onInk : color.ink}>{d.getDate()}</Text>
            </View>
            <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: has ? (active ? color.amber : color.muted) : "transparent" }} />
          </Pressable>
        );
      })}
    </View>
  );
  const legend = (
    <View style={{ flexDirection: "row", gap: space.md, flexWrap: "wrap" }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.legendItem}><View style={[styles.legendSwatch, { backgroundColor: color.white, borderColor: color.border }]} />
        <Text variant="meta" color={color.muted}>Synced, read only</Text></View>
      <View style={styles.legendItem}><View style={[styles.legendSwatch, { backgroundColor: color.planned, borderColor: color.plannedBorder }]} />
        <Text variant="meta" color={color.muted}>Your planned work</Text></View>
    </View>
  );

  // ── Day ─────────────────────────────────────────────────────────────────────
  const dayItems = (d: Date) => (data?.items ?? []).filter((i) => iso(new Date(i.starts_at)) === iso(d));
  const blocks: Block[] = [
    ...dayItems(date).filter((i) => !i.all_day).map((i) => ({
      key: i.id, kind: i.kind, title: titleOf(i), item: i, start: new Date(i.starts_at), end: new Date(i.ends_at),
      sub: i.kind === "calendar" ? "Synced, read only" : i.kind === "protected" ? "No auto-suggest" : i.kind === "task" ? "" : "Rhythm",
    })),
    ...(isToday && view === "day" ? (data?.open_windows ?? []) : []).map((w) => ({
      key: `open-${w.starts_at}`, kind: "open" as const, title: `Open, ${minutesBetween(new Date(w.starts_at), new Date(w.ends_at))} min`,
      window: w, start: new Date(w.starts_at), end: new Date(w.ends_at), sub: "",
    })),
  ];
  const placed = layout(blocks);
  const dayTasks = (data?.tasks ?? []).filter((t) => (t.focus_on ?? t.due_on) === iso(date));
  const openPriorities = dayTasks.filter((t) => !t.completed_at && t.priority_rank !== null);

  const dayView = (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Pressable onPress={() => setDate((d) => addDays(d, -1))} accessibilityRole="button" accessibilityLabel="Previous day"
                   style={{ minWidth: minTouch, minHeight: minTouch, justifyContent: "center" }}>
          <Icon name="chevronLeft" size={18} color={color.muted} />
        </Pressable>
        <Text variant="section" accessibilityRole="header">
          {date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
        </Text>
        <Pressable onPress={() => setDate((d) => addDays(d, 1))} accessibilityRole="button" accessibilityLabel="Next day"
                   style={{ minWidth: minTouch, minHeight: minTouch, justifyContent: "center", alignItems: "flex-end" }}>
          <Icon name="chevronRight" size={18} color={color.muted} />
        </Pressable>
      </View>
      {weekStrip}
      {legend}
      <View style={{ flexDirection: "row" }}>
        <View style={{ width: 34 }}>
          {Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => (
            <Text key={i} variant="meta" color={color.muted} style={{ height: ROW, fontSize: 11 }} maxFontSizeMultiplier={1.2}>
              {hourLabel(START_HOUR + i)}
            </Text>
          ))}
        </View>
        <View style={{ flex: 1, height: (END_HOUR - START_HOUR + 1) * ROW }}>
          {Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => (
            <View key={i} style={{ position: "absolute", top: i * ROW + 7, left: 0, right: 0, height: 1, backgroundColor: color.hairline }} />
          ))}
          {placed.map((b) => {
            const top = ((b.start.getHours() + b.start.getMinutes() / 60) - START_HOUR) * ROW + 7;
            const height = Math.max(30, (minutesBetween(b.start, b.end) / 60) * ROW - 2);
            if (top + height < 0 || top > (END_HOUR - START_HOUR + 1) * ROW) return null;
            const conflict = b.cols > 1 && b.kind !== "open";
            const synced = b.kind === "calendar";
            const style = b.kind === "open" ? { backgroundColor: "transparent", borderStyle: "dashed" as const, borderColor: color.amberLight }
              : b.kind === "protected" ? { backgroundColor: "transparent", borderStyle: "dashed" as const, borderColor: color.amber }
              : synced ? { backgroundColor: color.white, borderColor: color.border }
              : { backgroundColor: color.planned, borderColor: color.plannedBorder };
            const tag = b.item?.area_id ? toTag(areas[b.item.area_id]) : undefined;
            const isTask = b.kind === "task" && !!b.item?.task_id;
            const done = !!b.item?.completed;
            const narrow = b.cols > 1;
            const timeText = `${clock(b.start)} to ${clock(b.end)}`;
            return (
              <View key={b.key} style={{ position: "absolute", top, height, left: `${(b.col / b.cols) * 100}%`, width: `${100 / b.cols}%`,
                                         paddingHorizontal: 2 }}>
                <Pressable onPress={() => setSelected(b)} accessibilityRole="button"
                           accessibilityLabel={`${b.title}, ${clock(b.start)} to ${clock(b.end)}${synced ? ", synced, read only" : ""}${conflict ? ", overlaps" : ""}`}
                           style={[styles.block, style, conflict && { backgroundColor: color.conflict, borderColor: color.conflictBorder }]}>
                  {b.kind === "open" ? (
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6, flex: 1 }}>
                      <Text variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>{b.title}</Text>
                      {!narrow && <Text variant="metaStrong" color={color.amberText}>Plan here</Text>}
                    </View>
                  ) : (
                    <View style={{ flexDirection: "row", gap: 6, flex: 1 }}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Text variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1, textDecorationLine: done ? "line-through" : "none" }}
                                color={done ? color.muted : color.ink}>{b.title}</Text>
                          {isTask && !narrow && <Icon name="pencil" size={14} color={color.muted} />}
                        </View>
                        {height > 40 && (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                            <Text variant="meta" color={color.muted} numberOfLines={1} style={{ flexShrink: 1 }}>
                              {narrow ? clock(b.start) : timeText}{b.sub && !narrow ? `  ${b.sub}` : ""}
                            </Text>
                            {tag && !narrow && <TagChip tag={tag} size="sm" />}
                          </View>
                        )}
                      </View>
                      {isTask && (
                        <Pressable onPress={() => run(async () => {
                                     await setCompleted(b.item!.task_id!, !done);
                                     await updateBlock(b.item!.id, { completed: !done });
                                   })}
                                   hitSlop={10} accessibilityRole="checkbox" accessibilityState={{ checked: done }}
                                   accessibilityLabel={`${b.title}, done`} style={{ justifyContent: "center" }}>
                          <Check checked={done} />
                        </Pressable>
                      )}
                    </View>
                  )}
                </Pressable>
              </View>
            );
          })}
          {isToday && today.getHours() >= START_HOUR && today.getHours() <= END_HOUR && (
            <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, height: 2, backgroundColor: color.amber,
                                                top: ((today.getHours() + today.getMinutes() / 60) - START_HOUR) * ROW + 6 }} />
          )}
        </View>
      </View>
      {dayTasks.length > 0 && (
        <View>
          <Text variant="eyebrow" color={color.muted} style={{ marginBottom: 6 }}>Also on this day</Text>
          <Card padding="list">
            {dayTasks.map((t) => (
              <View key={t.id} style={{ flexDirection: "row", gap: 10, paddingVertical: 10, paddingHorizontal: space.sm }}>
                <Text variant="meta" color={color.muted} style={{ width: 52 }}>{t.due_on === iso(date) ? "Due" : "Focus"}</Text>
                <Text variant="bodyStrong" style={{ flex: 1, textDecorationLine: t.completed_at ? "line-through" : "none" }}
                      color={t.completed_at ? color.muted : color.ink}>{t.title}</Text>
              </View>
            ))}
          </Card>
        </View>
      )}
      <Text variant="meta" color={color.muted}>Overlapping items sit side by side. Tap one for its full title and actions.</Text>
    </>
  );

  // ── Week ────────────────────────────────────────────────────────────────────
  const selectedItems = dayItems(date);
  const selectedTasks = (data?.tasks ?? []).filter((t) => (t.focus_on ?? t.due_on) === iso(date));
  const weekView = (
    <>
      {weekStrip}
      <Text variant="section" accessibilityRole="header">{date.toLocaleDateString("en-US", { weekday: "short", day: "numeric" })}</Text>
      <Card padding="list">
        {selectedItems.length + selectedTasks.length === 0 && (
          <Text variant="meta" color={color.muted} style={{ padding: space.sm }}>Nothing scheduled yet, wide open.</Text>
        )}
        {selectedItems.map((i) => (
          <Pressable key={i.id} onPress={() => setSelected({ key: i.id, kind: i.kind, title: titleOf(i), item: i, start: new Date(i.starts_at),
                                                             end: new Date(i.ends_at), sub: "" })}
                     style={{ flexDirection: "row", gap: 10, paddingVertical: 10, paddingHorizontal: space.sm }} accessibilityRole="button">
            <Text variant="meta" color={color.muted} style={{ width: 52 }}>{i.all_day ? "All day" : clock(i.starts_at)}</Text>
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">{titleOf(i)}</Text>
              <Text variant="meta" color={color.muted}>{i.kind === "calendar" ? "Synced" : i.kind === "protected" ? "No auto-suggest" : "Rhythm"}</Text>
            </View>
          </Pressable>
        ))}
        {selectedTasks.map((t) => (
          <View key={t.id} style={{ flexDirection: "row", gap: 10, paddingVertical: 10, paddingHorizontal: space.sm }}>
            <Text variant="meta" color={color.muted} style={{ width: 52 }}>All day</Text>
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">{t.title}</Text>
              <Text variant="meta" color={color.muted}>{t.due_on === iso(date) ? "Due" : "Task"}</Text>
            </View>
          </View>
        ))}
      </Card>
    </>
  );

  // ── Month ───────────────────────────────────────────────────────────────────
  const states = Object.fromEntries((data?.days ?? []).map((d) => [d.date, d]));
  const stateOf = (d: string): CapacityDisplay | null => {
    const s = states[d];
    if (!s?.status) return null;
    if (s.status === "assessed" && s.state) return s.state as CapacityDisplay;
    return s.status === "uncertain" ? "Uncertain" : null;
  };
  const selectedState = stateOf(iso(date));
  const monthView = (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Pressable onPress={() => setDate(new Date(date.getFullYear(), date.getMonth() - 1, 1))} accessibilityRole="button"
                   accessibilityLabel="Previous month" style={{ minWidth: minTouch, minHeight: minTouch, justifyContent: "center" }}>
          <Icon name="chevronLeft" size={18} color={color.muted} />
        </Pressable>
        <Text variant="bodyStrong" accessibilityRole="header">{date.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</Text>
        <Pressable onPress={() => setDate(new Date(date.getFullYear(), date.getMonth() + 1, 1))} accessibilityRole="button"
                   accessibilityLabel="Next month" style={{ minWidth: minTouch, minHeight: minTouch, justifyContent: "center", alignItems: "flex-end" }}>
          <Icon name="chevronRight" size={18} color={color.muted} />
        </Pressable>
      </View>
      <MonthGrid
        month={date}
        today={iso(today)}
        selected={iso(date)}
        onSelect={(d) => setDate(fromIso(d))}
        marker={(d) => {
          const st = stateOf(d);
          return st ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: stateColor[st].base }} /> : null;
        }}
        label={(d) => stateOf(d) ?? "no Rhythm state"}
      />
      <Card>
        <Text variant="eyebrow" color={color.muted} style={{ marginBottom: space.xs }}>
          {date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </Text>
        {selectedState ? <StateBadge state={selectedState} size="sm" />
          : <Text variant="meta" color={color.muted}>No capacity read for this day.</Text>}
        <Text style={{ marginTop: space.xs }}>
          {selectedItems.length ? `${selectedItems.length} on the calendar.` : "Nothing on the calendar."}
        </Text>
        <Button label="Open full day" variant="ghost" onPress={() => setView("day")} style={{ marginTop: space.xs }} />
      </Card>
    </>
  );

  // ── Detail sheet actions per kind ───────────────────────────────────────────
  const sel = selected;
  const shift = (mins: number) => sel?.item && run(() => updateBlock(sel.item!.id, {
    starts_at: new Date(+new Date(sel.item!.starts_at) + mins * 60000).toISOString(),
    ends_at: new Date(+new Date(sel.item!.ends_at) + mins * 60000).toISOString(),
  }));
  const kindLabel = sel ? ({ calendar: "Synced event", event: "Rhythm commitment", commitment: "Rhythm commitment", routine: "Routine",
    habit: "Habit", protected: "Protected time", task: "Task", open: "Open window", reset: "Reset", focus: "Focus" } as Record<string, string>)[sel.kind] : "";

  return (
    <Screen
      gap={space.md}
      header={<ScreenHeader title="Plan" right={!isToday ? (
        <Pressable onPress={() => setDate(new Date())} accessibilityRole="button" hitSlop={10}
                   style={{ minHeight: minTouch, justifyContent: "center" }}>
          <Text variant="bodyStrong" color={color.amberText}>Today</Text>
        </Pressable>
      ) : undefined} />}
      overlay={<FAB onPress={() => setEditor({ open: true, editing: null })} accessibilityLabel="Add to plan" />}
    >
      <SegmentedControl<View_> stretch value={view} onChange={setView}
                               options={[{ key: "day", label: "Day" }, { key: "week", label: "Week" }, { key: "month", label: "Month" }]} />
      {error && <Text variant="meta" color="#6B2F2A">{error}</Text>}
      {view === "day" ? dayView : view === "week" ? weekView : monthView}

      <BottomSheet visible={!!sel} onClose={() => setSelected(null)} kicker={kindLabel} title={sel?.title}>
        {sel && (
          <View style={{ gap: space.xs }}>
            <Text variant="meta" color={color.muted}>
              {clockAmPm(sel.start)} – {clockAmPm(sel.end)}
            </Text>
            <Text style={{ marginBottom: space.sm }}>
              {sel.kind === "calendar" ? "Synced. Editing happens in your calendar app."
                : sel.kind === "open" ? "Nothing is scheduled here yet."
                : sel.kind === "protected" ? "Reserved. Nothing gets auto-suggested here."
                : sel.kind === "task" ? "A task you scheduled here."
                : "Created in Rhythm, yours to move or remove."}
            </Text>
            {(sel.kind === "event" || sel.kind === "commitment" || sel.kind === "protected" || sel.kind === "task") && sel.item?.editable && (
              <View style={{ flexDirection: "row", gap: space.xs }}>
                <Button label="− 30 min" variant="secondary" style={{ flex: 1 }} onPress={() => shift(-30)} />
                <Button label="+ 30 min" variant="secondary" style={{ flex: 1 }} onPress={() => shift(30)} />
              </View>
            )}
            {sel.kind === "task" && sel.item?.task_id && (
              <>
                <Button label="Mark complete" onPress={() => run(async () => {
                  await setCompleted(sel.item!.task_id!, true);
                  await updateBlock(sel.item!.id, { completed: true });
                })} />
                <Button label="Move to tomorrow" variant="secondary" onPress={() => run(async () => {
                  await updateTask(sel.item!.task_id!, { focus_on: iso(addDays(date, 1)) });
                  await deleteBlock(sel.item!.id);
                })} />
              </>
            )}
            {(sel.kind === "event" || sel.kind === "protected") && sel.item?.editable && (
              <Button label="Edit" variant="secondary" onPress={() => { const item = sel.item!; setSelected(null); setEditor({ open: true, editing: item }); }} />
            )}
            {(sel.kind === "event" || sel.kind === "commitment") && sel.item?.editable && (
              <Button label="Delete" variant="ghost" onPress={() => run(() => deleteBlock(sel.item!.id))} style={{ alignSelf: "center" }} />
            )}
            {sel.kind === "protected" && sel.item?.editable && (
              <Button label="Remove protection" variant="secondary" onPress={() => run(() => deleteBlock(sel.item!.id))} />
            )}
            {sel.kind === "open" && sel.window && (openPriorities.length ? openPriorities.map((t) => (
              <Button key={t.id} label={`Schedule ${t.title} here`} variant="secondary" onPress={() => run(() => {
                const s = new Date(sel.window!.starts_at);
                const windowEnd = new Date(sel.window!.ends_at);
                const length = Math.min(minutesBetween(s, windowEnd), t.estimate_minutes ?? 60);
                return createBlock({ kind: "task", task_id: t.id, starts_at: s.toISOString(),
                                     ends_at: new Date(+s + length * 60000).toISOString() });
              })} />
            )) : <Text variant="meta" color={color.muted}>Add a priority on Today to schedule it here.</Text>)}
            <Button label="Close" variant="ghost" onPress={() => setSelected(null)} style={{ alignSelf: "center" }} />
          </View>
        )}
      </BottomSheet>

      <BlockEditor
        visible={editor.open}
        editing={editor.editing}
        defaultDate={date}
        areas={Object.values(areas)}
        onClose={() => setEditor({ open: false, editing: null })}
        onSave={(draft) => {
          const editing = editor.editing;
          setEditor({ open: false, editing: null });
          run(() => (editing ? updateBlock(editing.id, draft) : createBlock(draft)));
        }}
        onDelete={editor.editing ? () => {
          const id = editor.editing!.id;
          setEditor({ open: false, editing: null });
          run(() => deleteBlock(id));
        } : undefined}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  block: { flex: 1, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6, overflow: "hidden" },
  stripDay: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "transparent" },
  stripActive: { backgroundColor: color.cacao, borderColor: color.cacao },
  stripToday: { borderColor: color.amber },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  legendSwatch: { width: 18, height: 14, borderRadius: 4, borderWidth: 1 },
});
