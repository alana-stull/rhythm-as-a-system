import React, { useMemo, useState } from "react";
import { LayoutChangeEvent, Pressable, View } from "react-native";
import Svg, { Circle, Line, Path, Rect } from "react-native-svg";
import type { InsightDay } from "../api/endpoints";
import { Button, Text, color, space, stateColor } from "../design";
import { fromIso } from "../lib/dates";

// Oura readiness over time (one numeric axis, 0–100, real values only; gaps
// stay gaps), with Rhythm states as dots in one marker row along the bottom, on
// the same day positions. States are categories, so they never sit on the
// number scale. The chart carries no state names; the readout under it and the
// day-detail sheet name the state for any day.

const GUTTER = 28;          // y axis labels
const PLOT_H = 132;
const ROW_H = 18;           // the Rhythm marker row
const TICKS = [0, 25, 50, 75, 100];

const short = (iso: string) => fromIso(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

type Mark = "Aligned" | "Balanced" | "Strained" | "Overloaded" | "Uncertain";

function markOf(d: InsightDay): Mark | null {
  if (!d.rhythm) return null;
  if (d.rhythm.status === "uncertain") return "Uncertain";
  return d.rhythm.status === "assessed" && d.rhythm.state ? (d.rhythm.state as Mark) : null;
}

export function TrendChart({ days, onOpenDay }: { days: InsightDay[]; onOpenDay: (date: string) => void }) {
  const [width, setWidth] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const plotW = Math.max(0, width - GUTTER - 6);
  const n = days.length;
  const x = (i: number) => GUTTER + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => 8 + (1 - v / 100) * (PLOT_H - 16);

  const readings = days.map((d) => d.reading?.readiness ?? null);
  const path = useMemo(() => {
    let p = "";
    readings.forEach((v, i) => {
      if (v === null) return;
      const joined = i > 0 && readings[i - 1] !== null;  // never draw across a missing day
      p += `${joined ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
    });
    return p;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, width]);

  const values = readings.filter((v): v is number => v !== null);
  const assessed = days.filter((d) => markOf(d)).length;
  const summary = values.length
    ? `Oura readiness, ${values.length} readings over ${n} days, from ${Math.min(...values)} to ${Math.max(...values)}. Rhythm states on ${assessed} days.`
    : `No Oura readings in these ${n} days. Rhythm states on ${assessed} days.`;

  const pick = (px: number) => {
    if (!n || plotW <= 0) return;
    const i = Math.round(((px - GUTTER) / plotW) * (n - 1));
    setPicked(Math.max(0, Math.min(n - 1, i)));
  };
  const sel = picked !== null ? days[picked] : null;
  const selMark = sel ? markOf(sel) : null;
  const rowY = PLOT_H + 8 + ROW_H / 2;
  const totalH = PLOT_H + 8 + ROW_H;
  const dots = n <= 31;
  // Marker size shrinks with the range so 3M dots don't run together.
  const step = n > 1 ? plotW / (n - 1) : plotW;
  const r = Math.max(2, Math.min(4, step * 0.4));

  return (
    <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} accessible
          accessibilityLabel={summary} accessibilityHint="Tap a day to see its details">
      {width > 0 && (
        <Pressable onPress={(e) => pick(e.nativeEvent.locationX)} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Svg width={width} height={totalH}>
            {TICKS.map((t) => (
              <Line key={t} x1={GUTTER} x2={GUTTER + plotW} y1={y(t)} y2={y(t)} stroke={color.hairline} strokeWidth={1} />
            ))}
            {sel && <Line x1={x(picked!)} x2={x(picked!)} y1={4} y2={totalH} stroke={color.borderStrong} strokeWidth={1} />}
            <Path d={path} stroke={color.amber} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
            {readings.map((v, i) => v !== null && (dots || i === picked) ? (
              <Circle key={i} cx={x(i)} cy={y(v)} r={i === picked ? 5 : 3.5} fill={color.amber} stroke={color.surface} strokeWidth={2} />
            ) : null)}
            <Rect x={GUTTER} y={rowY - 0.5} width={plotW} height={1} fill={color.hairline} />
            {days.map((d, i) => {
              const m = markOf(d);
              if (!m) return null;
              const hollow = m === "Uncertain";
              return (
                <Circle key={i} cx={x(i)} cy={rowY} r={i === picked ? r + 1.5 : r}
                        fill={hollow ? color.surface : stateColor[m].base}
                        stroke={hollow ? stateColor.Uncertain.base : color.surface} strokeWidth={1.5} />
              );
            })}
          </Svg>
          {/* Axis labels in text tokens (never the series color). */}
          <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, width: GUTTER - 6, height: totalH }}>
            {[100, 50, 0].map((t) => (
              <Text key={t} variant="meta" color={color.muted} maxFontSizeMultiplier={1.1}
                    style={{ position: "absolute", right: 0, top: y(t) - 8, fontSize: 11 }}>{t}</Text>
            ))}
          </View>
        </Pressable>
      )}
      {n > 0 && (
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginLeft: GUTTER, marginTop: 4 }}
              accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Text variant="meta" color={color.muted} style={{ fontSize: 11 }}>{short(days[0].date)}</Text>
          {n > 2 && <Text variant="meta" color={color.muted} style={{ fontSize: 11 }}>{short(days[Math.floor((n - 1) / 2)].date)}</Text>}
          <Text variant="meta" color={color.muted} style={{ fontSize: 11 }}>{short(days[n - 1].date)}</Text>
        </View>
      )}
      <View style={{ minHeight: 44, marginTop: space.xs, flexDirection: "row", alignItems: "center", gap: space.xs }}>
        {sel ? (
          <>
            <Text variant="meta" style={{ flex: 1 }}>
              {short(sel.date)} · {sel.reading?.readiness != null ? `Oura readiness ${Math.round(sel.reading.readiness)}` : "No Oura reading"}
              {" · "}{selMark ? (selMark === "Uncertain" ? "Rhythm: could go either way" : `Rhythm: ${selMark}`) : "No Rhythm state"}
            </Text>
            <Button label="Day details" size="sm" variant="secondary" onPress={() => onOpenDay(sel.date)} />
          </>
        ) : (
          <Text variant="meta" color={color.muted}>Tap the chart to look at a day.</Text>
        )}
      </View>
    </View>
  );
}
