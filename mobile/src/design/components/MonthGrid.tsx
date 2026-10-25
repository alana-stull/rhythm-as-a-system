import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { color as c } from "../tokens";
import { Text } from "./Text";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// A month as explicit seven-day rows (Sunday first). Rows of flex cells, not
// percentage widths, so rounding can never wrap Saturday onto the next line.
// v7: plain numbers (no boxes); the selected day is a cacao square, today has an amber ring, and days
// after today can be dimmed (Insights: nothing has happened yet).
export function MonthGrid({ month, selected, today, marker, onSelect, label, dimFuture = false }: {
  month: Date;                                   // any date in the month
  selected?: string | null;                      // ISO date
  today: string;                                 // ISO date
  marker?: (date: string) => React.ReactNode;    // dot / ring under the number
  onSelect?: (date: string) => void;
  label?: (date: string) => string;              // VoiceOver description of the day's data
  dimFuture?: boolean;
}) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: first.getDay() }, () => null),
    ...Array.from({ length: count }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1)),
  ];
  while (cells.length % 7) cells.push(null);
  const rows = Array.from({ length: cells.length / 7 }, (_, r) => cells.slice(r * 7, r * 7 + 7));

  return (
    <View>
      <View style={styles.row}>
        {WEEKDAYS.map((w, i) => (
          <Text key={i} variant="meta" color={c.muted} style={styles.weekday} maxFontSizeMultiplier={1.2}>{w}</Text>
        ))}
      </View>
      {rows.map((row, r) => (
        <View key={r} style={styles.row}>
          {row.map((d, i) => {
            if (!d) return <View key={i} style={styles.cell} />;
            const key = iso(d);
            const isSel = key === selected, isToday = key === today;
            const future = dimFuture && key > today;
            return (
              <View key={i} style={styles.cell}>
                <Pressable
                  onPress={() => onSelect?.(key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSel }}
                  accessibilityLabel={`${d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}${label ? `, ${label(key)}` : ""}`}
                  style={[styles.day, isToday && !isSel && styles.dayToday, isSel && styles.daySelected]}
                >
                  <Text variant="body" maxFontSizeMultiplier={1.2}
                        color={isSel ? c.onInk : future ? c.disabled : isToday ? c.amberText : c.ink}>{d.getDate()}</Text>
                  <View style={styles.marker}>{marker?.(key)}</View>
                </Pressable>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row" },
  weekday: { flex: 1, textAlign: "center", marginBottom: 6 },
  cell: { flex: 1, padding: 2 },
  day: {
    height: 46, borderRadius: 11, alignItems: "center", justifyContent: "center", gap: 3,
    borderWidth: 1.5, borderColor: "transparent",
  },
  daySelected: { backgroundColor: c.cacao, borderColor: c.cacao },
  dayToday: { borderColor: c.amber },
  marker: { height: 7, alignItems: "center", justifyContent: "center" },
});
