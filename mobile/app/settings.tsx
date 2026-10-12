import { useRouter } from "expo-router";
import React, { useState } from "react";
import { View } from "react-native";
import {
  BottomSheet,
  Button,
  Card,
  ConnectionRow,
  ConnectionTone,
  PastelKey,
  PastelPicker,
  Screen,
  ScreenHeader,
  SectionHeader,
  SegmentedControl,
  Tag,
  TagChip,
  Text,
  TextField,
  ToggleRow,
  color,
  space,
} from "../src/design";
import { tags as fixtureTags } from "../src/fixtures/p0";

// Oura's six states from the Settings board. In F6 these derive from
// `connections.status`, `last_synced_at` and whether today's data has arrived.
type OuraKey = "syncing" | "upToDate" | "notYet" | "delayed" | "expired" | "off";
const OURA: Record<OuraKey, { label: string; sub: string; tone: ConnectionTone; action: string; actionVariant: "primary" | "secondary" }> = {
  syncing:  { label: "Syncing…", sub: "Refreshing your readiness now.", tone: "working", action: "Off", actionVariant: "secondary" },
  upToDate: { label: "Up to date", sub: "Synced 14 minutes ago.", tone: "ok", action: "Off", actionVariant: "secondary" },
  notYet:   { label: "No data yet today", sub: "Usually syncs after you wake.", tone: "waiting", action: "Off", actionVariant: "secondary" },
  delayed:  { label: "Sync delayed", sub: "Last synced 9 hours ago.", tone: "delayed", action: "Off", actionVariant: "secondary" },
  expired:  { label: "Authorization expired", sub: "Reconnect to keep syncing.", tone: "error", action: "Reconnect", actionVariant: "primary" },
  off:      { label: "Not connected", sub: "Connect for a measured reading.", tone: "off", action: "Connect", actionVariant: "primary" },
};

export default function Settings() {
  const router = useRouter();
  const [oura, setOura] = useState<OuraKey>("upToDate");
  const [reminder, setReminder] = useState(true);
  const [tagList, setTagList] = useState<Tag[]>(Object.values(fixtureTags));
  const [sheet, setSheet] = useState(false);
  const [name, setName] = useState("");
  const [pastelKey, setPastelKey] = useState<PastelKey | null>(null);
  const o = OURA[oura];

  const createTag = () => {
    if (!name.trim() || !pastelKey) return;
    setTagList((xs) => [...xs, { id: `t${Date.now()}`, name: name.trim(), color: pastelKey }]);
    setSheet(false);
    setName("");
    setPastelKey(null);
  };

  return (
    <Screen header={<ScreenHeader title="Settings" back={{ label: "You", onPress: () => router.back() }} />}>
      <View style={{ gap: space.xs }}>
        <SectionHeader title="Connections" />
        <Text variant="meta" color={color.muted}>
          Ongoing connections — Rhythm shows current status, not just whether something's linked.
        </Text>
        <ConnectionRow name="Oura" status={{ label: o.label, tone: o.tone }} detail={o.sub} action={{ label: o.action, variant: o.actionVariant }} />
        <View style={{ gap: 6 }}>
          <Text variant="meta" color={color.muted}>P0 preview — Oura status:</Text>
          <SegmentedControl<OuraKey>
            value={oura}
            onChange={setOura}
            options={[
              { key: "syncing", label: "Sync" }, { key: "upToDate", label: "OK" }, { key: "notYet", label: "None" },
              { key: "delayed", label: "Late" }, { key: "expired", label: "Exp." }, { key: "off", label: "Off" },
            ]}
          />
        </View>
        <ConnectionRow name="Apple Health" detail="Sleep, HRV and resting heart rate, read-only." action={{ label: "Connect" }} />
        <ConnectionRow name="Apple Calendar" status={{ label: "Synced", tone: "ok" }} detail="Read-only here. Default tag per calendar." action={{ label: "On", variant: "secondary" }} />
        <ConnectionRow name="Google Calendar" detail="Unavailable right now." action={{ label: "Unavailable", variant: "secondary", disabled: true }} />
      </View>

      <View style={{ marginTop: space.md }}>
        <SectionHeader title="Tags" linkLabel="+ New" onLinkPress={() => setSheet(true)} />
        <Card>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {tagList.map((t) => (
              <TagChip key={t.id} tag={t} onRemove={() => setTagList((xs) => xs.filter((x) => x.id !== t.id))} />
            ))}
          </View>
        </Card>
      </View>

      <View style={{ marginTop: space.md }}>
        <SectionHeader title="Notifications & privacy" />
        <Card>
          <ToggleRow label="Daily check-in reminder" detail="Each morning, if you haven't logged." value={reminder} onChange={setReminder} />
        </Card>
      </View>

      <View style={{ gap: space.xs, marginTop: space.md }}>
        <Button variant="secondary" label="Sign out" disabled />
        <Button variant="ghost" label="Delete account" disabled />
      </View>

      <BottomSheet visible={sheet} onClose={() => setSheet(false)} title="New tag">
        <TextField value={name} onChangeText={setName} placeholder="Tag name" accessibilityLabel="Tag name" />
        <Text variant="eyebrow" color={color.muted} style={{ marginTop: space.md, marginBottom: space.xs }}>Color</Text>
        <PastelPicker value={pastelKey} onChange={setPastelKey} />
        <Button label="Create tag" fullWidth disabled={!name.trim() || !pastelKey} onPress={createTag} style={{ marginTop: space.lg }} />
        <Button label="Cancel" variant="secondary" fullWidth onPress={() => setSheet(false)} style={{ marginTop: space.xs }} />
      </BottomSheet>
    </Screen>
  );
}
