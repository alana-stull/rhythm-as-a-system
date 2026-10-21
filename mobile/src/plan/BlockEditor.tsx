import DateTimePicker from "@react-native-community/datetimepicker";
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import type { Area, PlanItem } from "../api/endpoints";
import { BottomSheet, Button, SegmentedControl, Text, TextField, color, pastel, radius, space } from "../design";
import { clockAmPm } from "../lib/dates";
import { toTag } from "../lib/tags";

export type BlockDraft = {
  kind: "event" | "protected";
  title: string | null;
  area_id: string | null;
  starts_at: string;
  ends_at: string;
};

const DURATIONS = [30, 60, 90];
const minutes = (a: Date, b: Date) => Math.round((+b - +a) / 60000);

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected: on }}
               style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.control, borderWidth: 1, minHeight: 36,
                        justifyContent: "center", borderColor: on ? color.ink : color.borderStrong,
                        backgroundColor: on ? color.ink : "transparent" }}>
      <Text variant="metaStrong" color={on ? color.onInk : color.ink}>{label}</Text>
    </Pressable>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <Text variant="eyebrow" color={color.muted} style={{ marginTop: space.md, marginBottom: space.xs }}>{children}</Text>;
}

// Add or edit a Rhythm block: any date, start and length (or end), commitment or
// protected time, optional tag. Presets are shortcuts, not limits.
export function BlockEditor({ visible, onClose, onSave, onDelete, defaultDate, editing, areas }: {
  visible: boolean;
  onClose: () => void;
  onSave: (draft: BlockDraft) => void;
  onDelete?: () => void;
  defaultDate: Date;
  editing?: PlanItem | null;
  areas: Area[];
}) {
  const [kind, setKind] = useState<"event" | "protected">("event");
  const [title, setTitle] = useState("");
  const [start, setStart] = useState(new Date());
  const [end, setEnd] = useState(new Date());
  const [areaId, setAreaId] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    if (editing) {
      setKind(editing.kind === "protected" ? "protected" : "event");
      setTitle(editing.title ?? "");
      setStart(new Date(editing.starts_at));
      setEnd(new Date(editing.ends_at));
      setAreaId(editing.area_id);
    } else {
      const s = new Date(defaultDate);
      const now = new Date();
      if (s.toDateString() === now.toDateString()) s.setHours(now.getHours(), now.getMinutes() < 30 ? 30 : 60, 0, 0);
      else s.setHours(9, 0, 0, 0);
      setKind("event"); setTitle(""); setAreaId(null);
      setStart(s); setEnd(new Date(+s + 60 * 60000));
    }
  }, [visible, editing, defaultDate]);

  // Keep the length when the date or start moves.
  const length = Math.max(5, minutes(start, end));
  const moveStart = (d: Date) => { setEnd(new Date(+d + length * 60000)); setStart(d); };
  const setDate = (d: Date) => {
    const s = new Date(start); s.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
    moveStart(s);
  };
  const setEndTime = (d: Date) => {
    const e = new Date(start); e.setHours(d.getHours(), d.getMinutes(), 0, 0);
    if (e <= start) e.setDate(e.getDate() + 1); // past midnight
    setEnd(e);
  };

  const presets = useMemo(() => {
    const base = new Date(start); base.setHours(Math.max(7, base.getHours()), base.getMinutes() < 30 ? 30 : 0, 0, 0);
    if (base <= start) base.setMinutes(base.getMinutes() + 30);
    return [0, 30, 60, 90].map((m) => new Date(+base + m * 60000)).filter((d) => d.getDate() === start.getDate());
  }, [start]);

  const valid = end > start && minutes(start, end) <= 24 * 60 && (kind === "protected" || title.trim().length > 0);

  return (
    <BottomSheet visible={visible} onClose={onClose} title={editing ? "Edit" : kind === "protected" ? "Protect time" : "Add commitment"}>
      <SegmentedControl value={kind} onChange={setKind}
                        options={[{ key: "event", label: "Commitment" }, { key: "protected", label: "Protected time" }]} />
      <TextField value={title} onChangeText={setTitle} style={{ marginTop: space.sm }}
                 placeholder={kind === "protected" ? "Label (optional)" : "What is it?"}
                 accessibilityLabel={kind === "protected" ? "Label" : "Commitment"} />

      <Label>Date</Label>
      <View style={{ alignItems: "flex-start" }}>
        <DateTimePicker value={start} mode="date" display="compact" onChange={(_, d) => d && setDate(d)}
                        accentColor={color.amber} accessibilityLabel="Date" />
      </View>

      <Label>Starts</Label>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        {presets.map((d) => <Chip key={+d} label={clockAmPm(d)} on={+d === +start} onPress={() => moveStart(d)} />)}
        <DateTimePicker value={start} mode="time" display="compact" minuteInterval={5}
                        onChange={(_, d) => d && moveStart(d)} accentColor={color.amber} accessibilityLabel="Start time" />
      </View>

      <Label>How long</Label>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        {DURATIONS.map((m) => <Chip key={m} label={`${m} min`} on={length === m} onPress={() => setEnd(new Date(+start + m * 60000))} />)}
        <Text variant="meta" color={color.muted}>ends</Text>
        <DateTimePicker value={end} mode="time" display="compact" minuteInterval={5}
                        onChange={(_, d) => d && setEndTime(d)} accentColor={color.amber} accessibilityLabel="End time" />
      </View>

      {areas.length > 0 && (
        <>
          <Label>Tag (optional)</Label>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {areas.map((a) => {
              const tag = toTag(a);
              if (!tag) return null;
              const p = pastel[tag.color];
              const on = areaId === a.id;
              return (
                <Pressable key={a.id} onPress={() => setAreaId(on ? null : a.id)} accessibilityRole="radio"
                           accessibilityState={{ selected: on }} accessibilityLabel={`Tag ${a.name}`}
                           style={{ paddingVertical: 7, paddingHorizontal: 12, borderRadius: radius.tag, backgroundColor: p.bg,
                                    borderWidth: 2, borderColor: on ? color.ink : "transparent" }}>
                  <Text variant="tag" color={p.text}>{a.name}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      <Button label={editing ? "Save changes" : "Add"} fullWidth disabled={!valid} style={{ marginTop: space.lg }}
              onPress={() => onSave({ kind, title: title.trim() || null, area_id: areaId,
                                      starts_at: start.toISOString(), ends_at: end.toISOString() })} />
      {editing && onDelete && (
        <Button label="Delete" variant="ghost" onPress={onDelete} style={{ alignSelf: "center", marginTop: space.sm }} />
      )}
      <Button label="Cancel" variant="secondary" fullWidth onPress={onClose} style={{ marginTop: space.xs }} />
    </BottomSheet>
  );
}
