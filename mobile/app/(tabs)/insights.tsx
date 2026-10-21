import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { Pressable, useWindowDimensions, View } from "react-native";
import { getDayDetail, getInsights, type DayDetail, type Insights as InsightsData } from "../../src/api/endpoints";
import {
  BottomSheet,
  Button,
  Card,
  CapacityDisplay,
  Icon,
  MonthGrid,
  Screen,
  ScreenHeader,
  SectionHeader,
  SegmentedControl,
  StateBadge,
  Text,
  color,
  minTouch,
  pastel,
  radius,
  space,
  stateColor,
} from "../../src/design";
import { TrendChart } from "../../src/insights/TrendChart";
import { addDays, fromIso, iso } from "../../src/lib/dates";

type Range = "1w" | "1m" | "3m";
const RANGE_DAYS: Record<Range, number> = { "1w": 7, "1m": 30, "3m": 90 };
const RANGE_TITLE: Record<Range, string> = {
  "1w": "Your week at a glance", "1m": "Your month at a glance", "3m": "Your last three months at a glance",
};

const LEVEL: Record<string, string> = { very_low: "very low", low: "low", moderate: "moderate", high: "high", very_high: "very high" };
const RESTED: Record<string, string> = { very_low: "not at all", low: "a little", moderate: "fairly", high: "well rested", very_high: "fully rested" };
const DEMAND: Record<string, string> = { very_light: "very light", light: "light", moderate: "moderate", heavy: "heavy", very_heavy: "very heavy" };

function hours(min: number) {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

function display(r: { status: string; state: string | null } | null | undefined): CapacityDisplay | null {
  if (!r) return null;
  if (r.status === "assessed" && r.state) return r.state as CapacityDisplay;
  return r.status === "uncertain" ? "Uncertain" : null;
}

export default function Insights() {
  const [range, setRange] = useState<Range>("1m");
  const [trend, setTrend] = useState<InsightsData | null>(null);
  const [month, setMonth] = useState(() => new Date());
  const [monthData, setMonthData] = useState<InsightsData | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<DayDetail | null>(null);
  const [about, setAbout] = useState(false);
  const { width, fontScale } = useWindowDimensions();
  const [error, setError] = useState<string | null>(null);
  const today = iso(new Date());

  const load = useCallback(async () => {
    try {
      const end = new Date();
      const first = new Date(month.getFullYear(), month.getMonth(), 1);
      const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
      const [t, m] = await Promise.all([
        getInsights(iso(addDays(end, -(RANGE_DAYS[range] - 1))), iso(end)),
        getInsights(iso(first), iso(last)),
      ]);
      setTrend(t);
      setMonthData(m);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load insights.");
    }
  }, [range, month]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const open = async (date: string) => {
    setSelected(date);
    try {
      setDetail(await getDayDetail(date));
    } catch {
      setDetail({ date, rhythm: null, basis: null, evidence: [], disagreements: [], interpretation: null,
                  reading: null, calendar: null, checkins: [] });
    }
  };

  const b = trend?.breakdown;
  const top = b?.states.slice(0, 2) ?? [];
  const other = (b?.states.slice(2) ?? []).reduce((n, s) => n + s.days, 0);
  const monthByDate = Object.fromEntries((monthData?.days ?? []).map((d) => [d.date, d]));
  const isCurrentMonth = month.getFullYear() === new Date().getFullYear() && month.getMonth() === new Date().getMonth();

  return (
    <Screen
      gap={space.lg}
      header={<ScreenHeader title="Insights" right={
        <Pressable onPress={() => setAbout(true)} accessibilityRole="button" accessibilityLabel="About this data"
                   hitSlop={6} style={{ minWidth: minTouch, minHeight: minTouch, alignItems: "flex-end", justifyContent: "center" }}>
          <Icon name="info" size={20} color={color.muted} />
        </Pressable>} />}
    >
      {error && <Text variant="meta" color="#6B2F2A">{error}</Text>}

      <View>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Pressable onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} accessibilityRole="button"
                     accessibilityLabel="Previous month" style={{ minWidth: minTouch, minHeight: minTouch, justifyContent: "center" }}>
            <Icon name="chevronLeft" size={18} color={color.muted} />
          </Pressable>
          <Text variant="section" accessibilityRole="header">{month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</Text>
          <Pressable onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} accessibilityRole="button"
                     accessibilityLabel="Next month" disabled={isCurrentMonth}
                     style={{ minWidth: minTouch, minHeight: minTouch, justifyContent: "center", alignItems: "flex-end", opacity: isCurrentMonth ? 0.3 : 1 }}>
            <Icon name="chevronRight" size={18} color={color.muted} />
          </Pressable>
        </View>
        <MonthGrid
          month={month}
          today={today}
          selected={selected}
          onSelect={(d) => { if (d <= today) open(d); }}
          marker={(d) => {
            const day = monthByDate[d];
            const s = display(day?.rhythm);
            if (s) return <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: stateColor[s].base }} />;
            if (day?.reading) return <View style={{ width: 7, height: 7, borderRadius: 4, borderWidth: 1.5, borderColor: color.muted }} />;
            return null;
          }}
          label={(d) => {
            const day = monthByDate[d];
            const s = display(day?.rhythm);
            return [s ? `Rhythm: ${s}` : "no Rhythm state",
                    day?.reading?.readiness != null ? `Oura readiness ${Math.round(day.reading.readiness)}` : "no Oura reading"].join(", ");
          }}
        />
        <View style={{ flexDirection: "row", gap: space.md, marginTop: space.xs }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color.ink }} />
            <Text variant="meta" color={color.muted}>Rhythm state</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, borderWidth: 1.5, borderColor: color.muted }} />
            <Text variant="meta" color={color.muted}>Oura reading only</Text>
          </View>
        </View>
      </View>

      <View style={{ gap: space.sm }}>
        {/* Heading and range on one row; at larger text sizes or on narrow phones the control drops below. */}
        <View style={[{ flexDirection: "row", alignItems: "center", gap: space.sm },
                      (fontScale > 1.3 || width < 360) && { flexDirection: "column", alignItems: "flex-start" }]}>
          <Text variant="section" accessibilityRole="header" style={fontScale > 1.3 || width < 360 ? undefined : { flex: 1 }}>
            {RANGE_TITLE[range]}
          </Text>
          <SegmentedControl value={range} onChange={setRange}
                            options={[{ key: "1w", label: "1W" }, { key: "1m", label: "1M" }, { key: "3m", label: "3M" }]} />
        </View>
        <Card>
          <Text variant="section" accessibilityRole="header">Oura readiness</Text>
          <Text variant="meta" color={color.muted} style={{ marginBottom: space.sm }}>
            Dots along the bottom mark days Rhythm assessed.
          </Text>
          {trend ? <TrendChart days={trend.days} onOpenDay={open} /> : <Text variant="meta" color={color.muted}>Loading…</Text>}
        </Card>
        {b && (
          <Card>
            <Text variant="eyebrow" color={color.muted} style={{ marginBottom: space.sm }}>Rhythm states</Text>
            {top.map((s) => (
              <View key={s.state} style={{ marginBottom: space.sm }} accessible accessibilityLabel={`${s.state}, ${s.days} days`}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: stateColor[s.state as CapacityDisplay].base }} />
                  <Text variant="bodyStrong" style={{ flex: 1 }}>{s.state}</Text>
                  <Text color={color.muted}>{s.days} day{s.days === 1 ? "" : "s"}</Text>
                </View>
                <View style={{ height: 8, borderRadius: 4, backgroundColor: color.fillMuted }}>
                  <View style={{ height: 8, borderRadius: 4, width: `${(s.days / b.assessed_days) * 100}%`,
                                 backgroundColor: stateColor[s.state as CapacityDisplay].base }} />
                </View>
              </View>
            ))}
            {other > 0 && (
              <View style={{ marginBottom: space.sm }} accessible accessibilityLabel={`Other states, ${other} days`}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color.muted }} />
                  <Text variant="bodyStrong" style={{ flex: 1 }}>Other states</Text>
                  <Text color={color.muted}>{other} day{other === 1 ? "" : "s"}</Text>
                </View>
                <View style={{ height: 8, borderRadius: 4, backgroundColor: color.fillMuted }}>
                  <View style={{ height: 8, borderRadius: 4, width: `${(other / b.assessed_days) * 100}%`, backgroundColor: color.muted }} />
                </View>
              </View>
            )}
            <View style={{ borderTopWidth: 1, borderTopColor: color.hairline, paddingTop: space.sm, gap: 4 }}>
              {([
                ["Assessed by Rhythm", b.assessed_days],
                ["Could go either way", b.uncertain_days],
                ["Oura readings only", b.reading_only_days],
                ["No data", b.no_data_days],
              ] as [string, number][]).filter(([, v], i) => v > 0 || i === 0).map(([k, v]) => (
                <View key={k} style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text variant="meta" color={color.muted}>{k}</Text>
                  <Text variant="metaStrong">{v} of {b.days_so_far} days</Text>
                </View>
              ))}
              <Text variant="meta" color={color.muted} style={{ marginTop: space.xs }}>{b.summary}</Text>
            </View>
          </Card>
        )}
      </View>

      {(trend?.patterns.length ?? 0) > 0 && (
        <View>
          <SectionHeader title="Patterns Rhythm has noticed" />
          <Card>
            {trend!.patterns.map((p) => (
              <View key={p.title} style={{ marginBottom: space.xs }}>
                <Text variant="bodyStrong">{p.title}</Text>
                <Text variant="meta" color={color.muted}>{p.body}</Text>
              </View>
            ))}
          </Card>
        </View>
      )}

      {(trend?.where_time_went.length ?? 0) > 0 && (
        <View>
          <SectionHeader title="Where your time went" />
          <Card>
            {trend!.where_time_went.map((t) => {
              const max = Math.max(...trend!.where_time_went.map((x) => x.minutes));
              const p = t.color_family && t.color_family in pastel ? pastel[t.color_family as keyof typeof pastel] : null;
              return (
                <View key={t.area_id} style={{ marginBottom: space.sm }} accessible accessibilityLabel={`${t.name}, ${hours(t.minutes)}`}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                    <Text variant="metaStrong">{t.name}</Text>
                    <Text variant="meta" color={color.muted}>{hours(t.minutes)}</Text>
                  </View>
                  <View style={{ height: 8, borderRadius: 4, backgroundColor: color.fillMuted }}>
                    <View style={{ height: 8, borderRadius: 4, width: `${(t.minutes / max) * 100}%`, backgroundColor: p ? p.text : color.muted, opacity: 0.55 }} />
                  </View>
                </View>
              );
            })}
          </Card>
        </View>
      )}

      <BottomSheet visible={about} onClose={() => setAbout(false)} title="About this data">
        <View style={{ gap: space.sm }}>
          <Text>
            Oura readiness is Oura's measure. A Rhythm state reflects capacity against what the day asked, and only appears
            when there was evidence for both. Nothing is filled in for days without data.
          </Text>
          <Button label="Close" variant="secondary" fullWidth onPress={() => setAbout(false)} />
        </View>
      </BottomSheet>

      <BottomSheet visible={!!detail} onClose={() => { setDetail(null); setSelected(null); }}
                   kicker={detail ? fromIso(detail.date).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }) : undefined}>
        {detail && (
          <View style={{ gap: space.sm }}>
            {display(detail.rhythm) ? (
              <View style={{ gap: 4 }}>
                <StateBadge state={display(detail.rhythm)!} />
                {detail.basis && <Text variant="meta" color={color.muted}>{detail.basis}{detail.rhythm?.confidence ? ` · ${detail.rhythm.confidence} confidence` : ""}</Text>}
              </View>
            ) : (
              <Text variant="meta" color={color.muted}>
                {detail.rhythm ? "Not enough evidence for a Rhythm state this day." : "No Rhythm state for this day."}
              </Text>
            )}
            {detail.interpretation && <Text>{detail.interpretation}</Text>}

            <View style={{ borderRadius: radius.option, backgroundColor: color.surface, borderWidth: 1, borderColor: color.hairline, padding: space.sm, gap: 4 }}>
              <Text variant="eyebrow" color={color.muted}>Oura</Text>
              {detail.reading ? (
                <>
                  {detail.reading.readiness != null && <Text>Readiness {Math.round(detail.reading.readiness)}</Text>}
                  {detail.reading.sleep_minutes != null && <Text>Slept {hours(detail.reading.sleep_minutes)}</Text>}
                  {detail.reading.hrv_ms != null && <Text>HRV {Math.round(detail.reading.hrv_ms)} ms</Text>}
                  {detail.reading.resting_hr != null && <Text>Resting heart rate {Math.round(detail.reading.resting_hr)} bpm</Text>}
                </>
              ) : <Text variant="meta" color={color.muted}>No Oura reading for this day.</Text>}
            </View>

            <View style={{ borderRadius: radius.option, backgroundColor: color.surface, borderWidth: 1, borderColor: color.hairline, padding: space.sm, gap: 4 }}>
              <Text variant="eyebrow" color={color.muted}>Check-ins</Text>
              {detail.checkins.length ? detail.checkins.map((c) => (
                <Text key={c.recorded_at}>
                  {new Date(c.recorded_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                  {": "}
                  {[c.energy && `energy ${LEVEL[c.energy]}`, c.rested && `rested ${RESTED[c.rested]}`,
                    c.perceived_demand && `day felt ${DEMAND[c.perceived_demand]}`].filter(Boolean).join(", ")}
                </Text>
              )) : <Text variant="meta" color={color.muted}>No check-in this day.</Text>}
            </View>

            <View style={{ borderRadius: radius.option, backgroundColor: color.surface, borderWidth: 1, borderColor: color.hairline, padding: space.sm, gap: 4 }}>
              <Text variant="eyebrow" color={color.muted}>Calendar</Text>
              <Text variant={detail.calendar ? "body" : "meta"} color={detail.calendar ? color.ink : color.muted}>
                {detail.calendar ?? "No calendar information for this day."}
              </Text>
            </View>

            {detail.disagreements.map((d) => (
              <View key={d} style={{ backgroundColor: stateColor.Strained.soft, borderRadius: radius.option, padding: space.sm }}>
                <Text variant="meta">{d}</Text>
              </View>
            ))}
            <Button label="Close" variant="secondary" fullWidth onPress={() => { setDetail(null); setSelected(null); }} />
          </View>
        )}
      </BottomSheet>
    </Screen>
  );
}
