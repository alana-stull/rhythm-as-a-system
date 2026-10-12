import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { Pressable, View } from "react-native";
import { getDayDetail, getInsights, type DayDetail, type Insights as InsightsData } from "../../src/api/endpoints";
import {
  BottomSheet,
  Button,
  Card,
  CapacityDisplay,
  Screen,
  ScreenHeader,
  SectionHeader,
  SegmentedControl,
  StateBadge,
  Text,
  color,
  pastel,
  radius,
  space,
  stateColor,
} from "../../src/design";
import { addDays, fromIso, iso, startOfWeek } from "../../src/lib/dates";

const SHORT: Record<string, string> = { Aligned: "Align", Balanced: "Bal", Strained: "Strain", Overloaded: "Over" };
const WEEK_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

function display(d?: { status: string; state: string | null }): CapacityDisplay | null {
  if (!d) return null;
  if (d.status === "assessed" && d.state) return d.state as CapacityDisplay;
  return d.status === "uncertain" ? "Uncertain" : null;
}

function hours(min: number) {
  const h = min / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1)}h`;
}

export default function Insights() {
  const [range, setRange] = useState<"week" | "month">("week");
  const [data, setData] = useState<InsightsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<DayDetail | null>(null);

  const today = new Date();
  const weekStart = startOfWeek(today);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const [start, end] = range === "week" ? [weekStart, addDays(weekStart, 6)] : [monthStart, monthEnd];

  const load = useCallback(async () => {
    try {
      setData(await getInsights(iso(start), iso(end)));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load insights.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const byDate = Object.fromEntries((data?.days ?? []).map((d) => [d.date, d]));
  const open = async (date: string) => {
    if (!byDate[date]) return;
    try { setDetail(await getDayDetail(date)); } catch (e) { setError(e instanceof Error ? e.message : "Couldn't load that day."); }
  };

  const maxMinutes = Math.max(1, ...(data?.where_time_went ?? []).map((t) => t.minutes));

  return (
    <Screen
      gap={space.lg}
      header={<ScreenHeader title="Insights" right={
        <SegmentedControl value={range} onChange={setRange} options={[{ key: "week", label: "Week" }, { key: "month", label: "Month" }]} />} />}
    >
      {error && <Text variant="meta" color="#6B2F2A">{error}</Text>}

      {range === "week" ? (
        <View>
          <View style={{ flexDirection: "row", gap: 5 }}>
            {Array.from({ length: 7 }, (_, i) => {
              const date = iso(addDays(weekStart, i));
              const s = display(byDate[date]);
              const c = s ? stateColor[s] : null;
              return (
                <Pressable key={date} onPress={() => open(date)} disabled={!byDate[date]} accessibilityRole="button"
                           accessibilityLabel={`${fromIso(date).toLocaleDateString("en-US", { weekday: "long" })}: ${s ?? "no read"}`}
                           style={{ flex: 1, alignItems: "center", gap: 6 }}>
                  <Text variant="meta" color={date === iso(today) ? color.amberText : color.muted}>{WEEK_LETTERS[i]}</Text>
                  <View style={{ alignSelf: "stretch", height: 56, borderRadius: 10, alignItems: "center", justifyContent: "center",
                                 backgroundColor: c ? c.soft : "transparent", borderWidth: c ? 0 : 1, borderStyle: "dashed",
                                 borderColor: "rgba(27,27,29,0.2)" }}>
                    <Text variant="tag" color={c ? c.text : color.muted} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                      {s ? (s === "Uncertain" ? "Unc." : SHORT[s]) : "—"}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
          <Text variant="meta" color={color.muted} style={{ marginTop: space.sm }}>
            The state is always the headline — numbers are secondary, when available at all.
          </Text>
        </View>
      ) : (
        <View>
          <View style={{ flexDirection: "row" }}>
            {["S", "M", "T", "W", "T", "F", "S"].map((w, i) => (
              <Text key={i} variant="meta" color={color.muted} style={{ flex: 1, textAlign: "center" }}>{w}</Text>
            ))}
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 6 }}>
            {Array.from({ length: monthStart.getDay() }, (_, i) => <View key={`pad${i}`} style={{ width: `${100 / 7}%` }} />)}
            {Array.from({ length: monthEnd.getDate() }, (_, i) => {
              const date = iso(new Date(today.getFullYear(), today.getMonth(), i + 1));
              const s = display(byDate[date]);
              const isToday = date === iso(today);
              return (
                <View key={date} style={{ width: `${100 / 7}%`, padding: 2 }}>
                  <Pressable onPress={() => open(date)} disabled={!byDate[date]} accessibilityRole="button"
                             accessibilityLabel={`${fromIso(date).toLocaleDateString("en-US", { month: "long", day: "numeric" })}: ${s ?? "no read"}`}
                             style={{ height: 44, borderRadius: 9, backgroundColor: color.surface, alignItems: "center", justifyContent: "center", gap: 3,
                                      borderWidth: isToday ? 1.5 : 1, borderColor: isToday ? color.amber : "rgba(27,27,29,0.07)" }}>
                    <Text variant="metaStrong" color={isToday ? color.amberText : color.ink}>{i + 1}</Text>
                    {s && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: stateColor[s].base }} />}
                  </Pressable>
                </View>
              );
            })}
          </View>
        </View>
      )}

      <View>
        <SectionHeader title="Patterns Rhythm has noticed" />
        <Card>
          {(data?.patterns.length ?? 0) === 0 ? (
            <Text variant="meta" color={color.muted}>Patterns show up after a few weeks of check-ins. Rhythm won't guess before then.</Text>
          ) : data!.patterns.map((p) => (
            <View key={p.title} style={{ marginBottom: space.xs }}>
              <Text variant="bodyStrong">{p.title}</Text>
              <Text variant="meta" color={color.muted}>{p.body}</Text>
            </View>
          ))}
        </Card>
      </View>

      <View>
        <SectionHeader title={range === "week" ? "Where the week went" : "Where the month went"} />
        <Card>
          {(data?.where_time_went.length ?? 0) === 0 ? (
            <Text variant="meta" color={color.muted}>Tag a calendar in Settings or tag scheduled tasks to see where time goes.</Text>
          ) : data!.where_time_went.map((t) => {
            const p = t.color_family && t.color_family in pastel ? pastel[t.color_family as keyof typeof pastel] : null;
            return (
              <View key={t.area_id} style={{ marginBottom: space.sm }} accessible accessibilityLabel={`${t.name}, ${hours(t.minutes)}`}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                  <Text variant="metaStrong">{t.name}</Text>
                  <Text variant="meta" color={color.muted}>{hours(t.minutes)}</Text>
                </View>
                <View style={{ height: 8, borderRadius: 4, backgroundColor: color.fillMuted }}>
                  <View style={{ height: 8, borderRadius: 4, width: `${(t.minutes / maxMinutes) * 100}%`, backgroundColor: p ? p.text : color.muted, opacity: 0.55 }} />
                </View>
              </View>
            );
          })}
        </Card>
      </View>

      <Card>
        <Text variant="eyebrow" color={color.muted} style={{ marginBottom: 4 }}>About this data</Text>
        <Text variant="meta" color={color.muted}>
          A state reflects capacity against demand — never a number you chose, and never invented when evidence is thin.
        </Text>
      </Card>

      <BottomSheet visible={!!detail} onClose={() => setDetail(null)}
                   kicker={detail ? fromIso(detail.date).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }) : undefined}>
        {detail && (
          <View style={{ gap: space.sm }}>
            <StateBadge state={detail.status === "assessed" && detail.state ? detail.state as CapacityDisplay
              : detail.status === "uncertain" ? "Uncertain" : "Insufficient"} label={detail.status === "insufficient_evidence" ? "Insufficient evidence" : undefined} />
            <Text variant="meta" color={color.muted}>{detail.basis}</Text>
            <Card padding="list">
              {detail.evidence.map((e) => (
                <Text key={e} style={{ paddingVertical: 8, paddingHorizontal: space.sm }}>{e}</Text>
              ))}
              {detail.confidence && (
                <Text variant="meta" color={color.muted} style={{ paddingVertical: 8, paddingHorizontal: space.sm }}>
                  Confidence: {detail.confidence}
                </Text>
              )}
            </Card>
            {detail.disagreements.map((d) => (
              <View key={d} style={{ backgroundColor: stateColor.Strained.soft, borderRadius: radius.option, padding: space.sm }}>
                <Text variant="meta">{d}</Text>
              </View>
            ))}
            {detail.interpretation && (
              <View>
                <Text variant="eyebrow" color={color.muted} style={{ marginBottom: 4 }}>Rhythm's interpretation</Text>
                <Text>{detail.interpretation}</Text>
              </View>
            )}
            <Button label="Close" variant="secondary" fullWidth onPress={() => setDetail(null)} />
          </View>
        )}
      </BottomSheet>
    </Screen>
  );
}
