import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { clearPriority, createTask, makePriority, setCompleted } from "../../src/api/endpoints";
import type { Today as TodayData } from "../../src/api/types";
import {
  Button,
  Card,
  CapacityDisplay,
  ChecklistRow,
  color,
  DarkCallout,
  Eyebrow,
  Icon,
  PastelKey,
  pastel,
  Screen,
  ScreenHeader,
  SectionHeader,
  space,
  StateBadge,
  TagChip,
  Text,
  TextField,
} from "../../src/design";
import { useEventTitles } from "../../src/integrations/calendar";
import { useSession } from "../../src/auth/SessionProvider";
import { CheckinSheet } from "../../src/today/CheckinSheet";
import { useToday } from "../../src/today/useToday";

const MAX_PRIORITIES = 3; // Top 3 (tasks.priority_rank 1–3)

// Local time of day, with the person's first name when we have one.
function greeting(d: Date, displayName?: string | null) {
  const h = d.getHours();
  const part = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  const first = displayName?.trim().split(/\s+/)[0];
  return first ? `${part}, ${first}.` : `${part}.`;
}

// "2:00" / "3:30" — the boards' clock style.
function clock(iso: string) {
  const d = new Date(iso);
  return `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function badgeState(c: TodayData["capacity"]): CapacityDisplay {
  if (c.status === "assessed" && c.state) return c.state;
  return c.status === "uncertain" ? "Uncertain" : "Insufficient";
}

// Highlighted words (e.g. "4 days") in light amber, as on the board.
function Highlighted({ text, highlight }: { text: string; highlight: string | null }) {
  const at = highlight ? text.indexOf(highlight) : -1;
  if (!highlight || at < 0) return <Text color={color.onInk}>{text}</Text>;
  return (
    <Text color={color.onInk}>
      {text.slice(0, at)}
      <Text variant="bodyStrong" color={color.amberLight}>{highlight}</Text>
      {text.slice(at + highlight.length)}
    </Text>
  );
}

export default function Today() {
  const router = useRouter();
  const { profile } = useSession();
  const { data, setData, areas, error, refreshing, reload } = useToday();
  const titles = useEventTitles(data?.schedule.upcoming ?? []);
  const [draft, setDraft] = useState("");
  const [sheet, setSheet] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const now = useMemo(() => new Date(), [data]);

  // Optimistic edit, then the server's view of the day (the state can change).
  const act = async (optimistic: (d: TodayData) => TodayData, call: () => Promise<unknown>) => {
    if (data) setData(optimistic(data));
    setActionError(null);
    try {
      await call();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "That didn't save.");
    }
    reload();
  };

  const add = async () => {
    const title = draft.trim();
    if (!title) return;
    setDraft("");
    await act((d) => d, async () => makePriority((await createTask(title)).id));
  };

  const header = (
    <ScreenHeader
      overline={now.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
      title={greeting(now, profile?.display_name)}
    />
  );

  if (!data) {
    return (
      <Screen header={header} gap={space.lg} refreshing={refreshing} onRefresh={() => reload(true)}>
        {error ? (
          <Card>
            <Text style={{ marginBottom: space.sm }}>{error}</Text>
            <Button label="Try again" variant="secondary" onPress={() => reload()} />
          </Card>
        ) : (
          <Text color={color.muted}>Loading your day…</Text>
        )}
      </Screen>
    );
  }

  const cap = data.capacity;
  const state = badgeState(cap);
  const wmn = data.what_matters_now;
  const priorities = data.priorities;
  const canAdd = priorities.length < MAX_PRIORITIES;
  const upcoming = data.schedule.upcoming;

  return (
    <Screen header={header} gap={space.lg} refreshing={refreshing} onRefresh={() => reload(true)}>
      {state === "Insufficient" ? (
        // Not enough evidence: say what's missing and offer the check-in here, not in a pill.
        <Card>
          <Eyebrow>How you're doing</Eyebrow>
          {cap.context && <Text style={{ marginTop: 10 }}>{cap.context}</Text>}
          <Button label="Check in" size="sm" variant="secondary" onPress={() => setSheet(true)}
                  accessibilityHint="Opens a quick check-in" style={{ alignSelf: "flex-start", marginTop: space.sm }} />
        </Card>
      ) : (
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.xs }}>
            <Eyebrow>How you're doing</Eyebrow>
            <StateBadge state={state} size="sm" onPress={() => setSheet(true)} style={{ alignSelf: "center" }} />
          </View>
          {/* Why capacity looks this way. "What matters now" is what to do about it. */}
          {cap.context && <Text style={{ marginTop: 10 }}>{cap.context}</Text>}
        </Card>
      )}

      {wmn && (
        wmn.kind === "check_in" ? (
          <Pressable onPress={() => setSheet(true)} accessibilityRole="button" accessibilityHint="Opens a quick check-in">
            <DarkCallout eyebrow="What matters now"><Highlighted text={wmn.text} highlight={wmn.highlight} /></DarkCallout>
          </Pressable>
        ) : (
          <DarkCallout eyebrow="What matters now"><Highlighted text={wmn.text} highlight={wmn.highlight} /></DarkCallout>
        )
      )}

      <View>
        <SectionHeader title="Priorities" />
        <Card padding="list">
          {priorities.map((p) => (
            <ChecklistRow
              key={p.id}
              label={p.title}
              checked={!!p.completed_at}
              onToggle={() => act(
                (d) => ({ ...d, priorities: d.priorities.map((x) => x.id === p.id
                  ? { ...x, completed_at: x.completed_at ? null : new Date().toISOString() } : x) }),
                () => setCompleted(p.id, !p.completed_at))}
              onRemove={() => act(
                (d) => ({ ...d, priorities: d.priorities.filter((x) => x.id !== p.id) }),
                () => clearPriority(p.id))}
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
        {actionError && <Text variant="meta" color="#6B2F2A" style={{ marginTop: 6 }}>{actionError}</Text>}
      </View>

      <View>
        <SectionHeader title="Today's schedule" linkLabel="View full day →" onLinkPress={() => router.navigate("/plan")} />
        <Card padding="list">
          {upcoming.length === 0 ? (
            <Text variant="meta" color={color.muted} style={{ paddingVertical: 10, paddingHorizontal: space.sm }}>
              {data.schedule.calendar_connected ? "Nothing else on the calendar today." : "Connect your calendar in Settings to see what's next."}
            </Text>
          ) : (
            upcoming.map((e) => {
              const title = e.title ?? titles[e.external_id ?? ""] ?? "Busy";
              const area = e.area_id ? areas[e.area_id] : undefined;
              const tag = area?.color_family && area.color_family in pastel
                ? { id: area.id, name: area.name, color: area.color_family as PastelKey } : undefined;
              return (
                <View
                  key={e.id}
                  accessible
                  accessibilityLabel={`${clock(e.starts_at)}, ${title}${tag ? `, ${tag.name}` : ""}`}
                  style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, paddingHorizontal: space.sm }}
                >
                  <Text variant="meta" color={color.muted} style={{ width: 40 }}>{clock(e.starts_at)}</Text>
                  <Text variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>{title}</Text>
                  {tag && <TagChip tag={tag} size="sm" />}
                </View>
              );
            })
          )}
        </Card>
      </View>

      <CheckinSheet visible={sheet} onClose={() => setSheet(false)} onSaved={() => reload()} />
    </Screen>
  );
}
