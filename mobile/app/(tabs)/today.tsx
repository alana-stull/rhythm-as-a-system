import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { View } from "react-native";
import {
  Card,
  DarkCallout,
  ChecklistRow,
  color,
  Eyebrow,
  Icon,
  Screen,
  ScreenHeader,
  SectionHeader,
  space,
  StateBadge,
  TagChip,
  Text,
  TextField,
} from "../../src/design";
import { mockNow, mockToday } from "../../src/fixtures/p0";
import { capacityContext } from "../../src/today/capacityContext";

const MAX_PRIORITIES = 3; // Top 3 (tasks.priority_rank 1–3)
const SCHEDULE_PREVIEW = 2; // the rest lives in Plan

function greeting(d: Date) {
  const h = d.getHours();
  return h < 12 ? "Good morning." : h < 17 ? "Good afternoon." : "Good evening.";
}

// "2:00" / "3:30" — the boards' clock style; "2–3:30" for ranges.
function clock(d: Date) {
  const h = d.getHours() % 12 || 12;
  return `${h}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function compact(d: Date) {
  return d.getMinutes() === 0 ? String(d.getHours() % 12 || 12) : clock(d);
}

// P0 composition of the Today board on mock data. Interactions are local only.
export default function Today() {
  const router = useRouter();
  const now = useMemo(() => mockNow(), []);
  const data = useMemo(() => mockToday(now), [now]);
  const context = capacityContext(data.capacity.evidence);
  const [items, setItems] = useState(data.priorities);
  const [draft, setDraft] = useState("");
  const canAdd = items.length < MAX_PRIORITIES;

  // Upcoming = starts later today. Never more than two on Today.
  const upcoming = data.events
    .filter((e) => e.start >= now && e.start.toDateString() === now.toDateString())
    .slice(0, SCHEDULE_PREVIEW);

  // A recommendation about a task only stands while that task is open and its
  // window is still ahead of us today.
  const rec = data.recommendation;
  const windowAhead = rec.window.start >= now && rec.window.end.toDateString() === now.toDateString();
  const recTask = windowAhead ? items.find((p) => p.id === rec.taskId && !p.done) : undefined;

  const add = () => {
    const label = draft.trim();
    if (!label || !canAdd) return;
    setItems((xs) => [...xs, { id: `x${Date.now()}`, label, done: false }]);
    setDraft("");
  };

  return (
    <Screen
      gap={space.lg}
      header={
        <ScreenHeader
          overline={now.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
          title={greeting(now)}
        />
      }
    >
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.xs }}>
          <Eyebrow>How you're doing</Eyebrow>
          <StateBadge state={data.capacity.state} size="sm" />
        </View>
        {/* Why capacity looks this way. "What matters now" is what to do about it. */}
        {context && <Text style={{ marginTop: 10 }}>{context}</Text>}
      </Card>

      {recTask && (
        <DarkCallout eyebrow="What matters now">
          <Text color={color.onInk}>
            {recTask.label} has been pushed{" "}
            <Text variant="bodyStrong" color={color.amberLight}>{rec.deferredDays} days</Text>. Your{" "}
            {compact(rec.window.start)}–{compact(rec.window.end)} is open and fits it.
          </Text>
        </DarkCallout>
      )}

      <View>
        <SectionHeader title="Priorities" />
        <Card padding="list">
          {items.map((p) => (
            <ChecklistRow
              key={p.id}
              label={p.label}
              checked={p.done}
              onToggle={() => setItems((xs) => xs.map((x) => (x.id === p.id ? { ...x, done: !x.done } : x)))}
              onRemove={() => setItems((xs) => xs.filter((x) => x.id !== p.id))}
            />
          ))}
          {canAdd && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: space.xs }}>
              <Icon name="plus" size={16} color={color.amber} strokeWidth={2.3} />
              <TextField
                inline
                value={draft}
                onChangeText={setDraft}
                onSubmitEditing={add}
                placeholder="Add a priority"
                returnKeyType="done"
                accessibilityLabel="Add a priority"
              />
            </View>
          )}
        </Card>
      </View>

      <View>
        <SectionHeader title="Today's schedule"linkLabel="View full day →" onLinkPress={() => router.navigate("/plan")} />
        <Card padding="list">
          {upcoming.length === 0 ? (
            <Text variant="meta" color={color.muted} style={{ paddingVertical: 10, paddingHorizontal: space.sm }}>
              Nothing else on the calendar today.
            </Text>
          ) : (
            upcoming.map((e) => (
              <View
                key={e.id}
                accessible
                accessibilityLabel={`${clock(e.start)}, ${e.title}${e.tag ? `, ${e.tag.name}` : ""}`}
                style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, paddingHorizontal: space.sm }}
              >
                <Text variant="meta" color={color.muted} style={{ width: 40 }}>{clock(e.start)}</Text>
                <Text variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>{e.title}</Text>
                {e.tag && <TagChip tag={e.tag} size="sm" />}
              </View>
            ))
          )}
        </Card>
      </View>
    </Screen>
  );
}
