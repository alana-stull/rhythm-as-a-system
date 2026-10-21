import { useRouter } from "expo-router";
import React, { useState } from "react";
import { View } from "react-native";
import {
  BottomSheet,
  Button,
  CapacityDisplay,
  Card,
  ChecklistRow,
  CollapsedQuestionRow,
  ConnectionRow,
  DarkCallout,
  Eyebrow,
  OptionRow,
  PastelKey,
  PastelPicker,
  ScaleSelector,
  Screen,
  ScreenHeader,
  SectionHeader,
  SegmentedControl,
  StateBadge,
  TagChip,
  Text,
  TextField,
  ToggleRow,
  TypeRole,
  color,
  pastel,
  pastelKeys,
  space,
  type,
} from "../src/design";

// P0 review surface: every token and component, in every state.
const SWATCHES: [string, string][] = [
  ["Cream", color.cream], ["Surface", color.surface], ["Ink", color.ink], ["Muted", color.muted],
  ["Amber", color.amber], ["Amber text", color.amberText], ["Light amber", color.amberLight],
  ["Maroon", color.maroon], ["Evergreen", color.evergreen], ["Navy", color.navy], ["Sage", color.sage],
];

const STATES: { state: CapacityDisplay; source?: string; label?: string }[] = [
  { state: "Aligned", source: "check-in + Oura" },
  { state: "Balanced", source: "self-reported" },
  { state: "Strained", source: "check-in + calendar" },
  { state: "Overloaded", source: "Apple Health + calendar" },
  { state: "Uncertain", source: "signals disagree" },
  { state: "Insufficient" },
  { state: "Insufficient", label: "No data yet, how are you feeling?" },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: space.xs, marginTop: space.md }}>
      <SectionHeader title={title} />
      {children}
    </View>
  );
}

export default function Design() {
  const router = useRouter();
  const [seg, setSeg] = useState<"day" | "week" | "month">("day");
  const [scale, setScale] = useState<number | null>(3);
  const [opt, setOpt] = useState("school");
  const [multi, setMulti] = useState<Record<string, boolean>>({ capacity: true });
  const [checks, setChecks] = useState({ a: false, b: true, c: false });
  const [pk, setPk] = useState<PastelKey | null>("sky");
  const [toggle, setToggle] = useState(true);
  const [sheet, setSheet] = useState(false);

  return (
    <Screen header={<ScreenHeader title="Design system" overline="P0 review" back={{ label: "You", onPress: () => router.back() }} />}>
      <Section title="Color">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {SWATCHES.map(([n, h]) => (
            <View key={n} style={{ width: 96 }}>
              <View style={{ height: 44, borderRadius: 10, backgroundColor: h, borderWidth: 1, borderColor: color.hairline }} />
              <Text variant="metaStrong">{n}</Text>
              <Text variant="meta" color={color.muted}>{h}</Text>
            </View>
          ))}
        </View>
      </Section>

      <Section title="Capacity states">
        {STATES.map((s, i) => <StateBadge key={i} {...s} />)}
        <StateBadge state="Balanced" source="self-reported" size="sm" />
      </Section>

      <Section title="Tags">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {pastelKeys.map((k) => <TagChip key={k} tag={{ id: k, name: pastel[k].label, color: k }} />)}
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <TagChip tag={{ id: "w", name: "Work", color: "sky" }} size="sm" />
          <TagChip tag={{ id: "r", name: "Removable", color: "lilac" }} onRemove={() => {}} />
        </View>
      </Section>

      <Section title="Type">
        {(Object.keys(type) as TypeRole[]).map((r) => (
          <View key={r}>
            <Text variant="meta" color={color.muted}>{r} · {type[r].style.fontSize}pt (mockup {type[r].mockupPx}px) · max ×{type[r].maxScale}</Text>
            <Text variant={r}>Make room for what matters</Text>
          </View>
        ))}
      </Section>

      <Section title="Surfaces">
        <Card>
          <Eyebrow style={{ marginBottom: 4 }}>Card label</Eyebrow>
          <Text>Cards sit on a hairline border, no shadow. Shadow is reserved for sheets.</Text>
        </Card>
        <DarkCallout eyebrow="What matters now">
          <Text color={color.onInk}>Dark callout with a <Text variant="bodyStrong" color={color.amberLight}>highlight</Text>.</Text>
        </DarkCallout>
      </Section>

      <Section title="Buttons">
        <Button label="Primary action" />
        <Button label="Secondary" variant="secondary" />
        <Button label="Disabled" disabled />
        <Button label="Ghost / link →" variant="ghost" />
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button size="sm" label="Connect" />
          <Button size="sm" label="On" variant="secondary" />
        </View>
        <Button label="Open bottom sheet" variant="secondary" onPress={() => setSheet(true)} />
      </Section>

      <Section title="Lists">
        <Card padding="list">
          <ChecklistRow label="Unchecked, removable" checked={checks.a} onToggle={() => setChecks((c) => ({ ...c, a: !c.a }))} onRemove={() => {}} />
          <ChecklistRow label="Checked, tagged, starred" checked={checks.b} onToggle={() => setChecks((c) => ({ ...c, b: !c.b }))} tag={{ id: "s", name: "School", color: "sage" }} starred onStar={() => {}} />
          <ChecklistRow label="Square (multi-pick)" shape="square" checked={checks.c} onToggle={() => setChecks((c) => ({ ...c, c: !c.c }))} />
        </Card>
        <TextField placeholder="Boxed text field" accessibilityLabel="Boxed text field" />
      </Section>

      <Section title="Choices">
        <SegmentedControl value={seg} onChange={setSeg} options={[{ key: "day", label: "Day" }, { key: "week", label: "Week" }, { key: "month", label: "Month" }]} />
        <ScaleSelector value={scale} onChange={setScale} stepLabels={["Very low", "Low", "Middling", "High", "Very high"]} accessibilityLabel="Energy" />
        {[["school", "In school"], ["ft", "Working full-time"]].map(([k, l]) => (
          <OptionRow key={k} label={l} selected={opt === k} onPress={() => setOpt(k)} />
        ))}
        <OptionRow multi label="Understanding my capacity" selected={!!multi.capacity} onPress={() => setMulti((m) => ({ ...m, capacity: !m.capacity }))} />
        <CollapsedQuestionRow question="How much energy do you have today?" answer="3 of 5, Middling" onPress={() => {}} />
        <PastelPicker value={pk} onChange={setPk} />
        <Card><ToggleRow label="Daily check-in reminder" detail="Each morning, if you haven't logged." value={toggle} onChange={setToggle} /></Card>
      </Section>

      <Section title="Connections">
        <ConnectionRow name="Oura" status={{ label: "Up to date", tone: "ok" }} detail="Synced 14 minutes ago." action={{ label: "Off", variant: "secondary" }} />
        <ConnectionRow name="Oura" status={{ label: "Authorization expired", tone: "error" }} detail="Reconnect to keep syncing." action={{ label: "Reconnect" }} />
      </Section>

      <BottomSheet visible={sheet} onClose={() => setSheet(false)} kicker="Synced event" title="Team sync">
        <Text variant="meta" color={color.muted}>9:00 AM – 9:30 AM</Text>
        <Text style={{ marginTop: space.xs }}>This came from your connected calendar.</Text>
        <Button label="Close" variant="secondary" fullWidth onPress={() => setSheet(false)} style={{ marginTop: space.lg }} />
      </BottomSheet>
    </Screen>
  );
}
