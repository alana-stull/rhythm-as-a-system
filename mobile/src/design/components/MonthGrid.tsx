import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { color as c } from "../tokens";
import { Text } from "./Text";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// A month as explicit seven-day rows (Sunday first). Rows of flex cells, not
// percentage widths, so rounding can never wrap Saturday onto the next line.
export function MonthGrid({ month, selected, today, marker, onSelect, label }: {
  month: Date;                                   // any date in the month
  selected?: string | null;                      // ISO date
  today: string;                                 // ISO date
  marker?: (date: string) => React.ReactNode;    // dot / ring under the number
  onSelect?: (date: string) => void;
  label?: (date: string) => string;              // VoiceOver description of the day's data
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
            return (
              <View key={i} style={styles.cell}>
                <Pressable
                  onPress={() => onSelect?.(key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSel }}
                  accessibilityLabel={`${d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}${label ? `, ${label(key)}` : ""}`}
                  style={[styles.day, isSel && styles.daySelected, isToday && styles.dayToday]}
                >
                  <Text variant="metaStrong" color={isToday ? c.amberText : c.ink} maxFontSizeMultiplier={1.2}>{d.getDate()}</Text>
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
    height: 46, borderRadius: 9, alignItems: "center", justifyContent: "center", gap: 3,
    backgroundColor: c.surface, borderWidth: 1, borderColor: "rgba(27,27,29,0.07)",
  },
  daySelected: { backgroundColor: c.amberSoft, borderColor: "rgba(184,119,42,0.4)" },
  dayToday: { borderWidth: 1.5, borderColor: c.amber },
  marker: { height: 7, alignItems: "center", justifyContent: "center" },
});
