import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Linking, Pressable, View } from "react-native";
import {
  type Area,
  type ConnectionState,
  type ConnectionStatus,
  createArea,
  deleteArea,
  getConnections,
  listAreas,
  ouraDisconnect,
} from "../src/api/endpoints";
import { useSession } from "../src/auth/SessionProvider";
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
  TagChip,
  Text,
  TextField,
  ToggleRow,
  color,
  minTouch,
  pastel,
  radius,
  space,
} from "../src/design";
import { calendarAccess, disconnectCalendar, type CalendarAccess } from "../src/integrations/calendar";
import { connectAppleHealth, connectCalendar, connectOura as connectOuraFlow } from "../src/integrations/connect";
import { healthAvailable } from "../src/integrations/healthkit";

// The six states from the Settings board, now from GET /connections.
const STATE: Record<ConnectionState, { label: string; tone: ConnectionTone }> = {
  syncing: { label: "Syncing…", tone: "working" },
  up_to_date: { label: "Up to date", tone: "ok" },
  not_yet: { label: "No data yet today", tone: "waiting" },
  delayed: { label: "Sync delayed", tone: "delayed" },
  expired: { label: "Authorization expired", tone: "error" },
  off: { label: "Not connected", tone: "off" },
  unavailable: { label: "Unavailable", tone: "off" },
};

function synced(at: string | null) {
  if (!at) return null;
  const mins = Math.round((Date.now() - new Date(at).getTime()) / 60000);
  if (mins < 1) return "Synced just now.";
  if (mins < 60) return `Synced ${mins} minute${mins === 1 ? "" : "s"} ago.`;
  const hrs = Math.round(mins / 60);
  return `Last synced ${hrs} hour${hrs === 1 ? "" : "s"} ago.`;
}

export default function Settings() {
  const router = useRouter();
  const { profile, signOut, deleteAccount } = useSession();
  const [deleting, setDeleting] = useState<"ask" | "busy" | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [conns, setConns] = useState<Record<string, ConnectionStatus>>({});
  const [tags, setTags] = useState<Area[]>([]);
  const [calAccess, setCalAccess] = useState<CalendarAccess | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reminder, setReminder] = useState(true);
  const [sheet, setSheet] = useState(false);
  const [name, setName] = useState("");
  const [pastelKey, setPastelKey] = useState<PastelKey | null>(null);

  const load = useCallback(async () => {
    try {
      const [c, t] = await Promise.all([getConnections(), listAreas()]);
      setCalAccess(await calendarAccess().catch(() => null));
      setConns(Object.fromEntries(c.map((x) => [x.provider, x])));
      setTags(t);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load settings.");
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const run = (key: string, fn: () => Promise<unknown>) => async () => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work. Try again.");
    } finally {
      setBusy(null);
      load();
    }
  };

  const connectOura = run("oura", connectOuraFlow);
  const connectCal = run("calendar", connectCalendar);
  const connectHealthKit = run("health", connectAppleHealth);

  const row = (provider: string) => conns[provider];
  const oura = row("oura"), cal = row("apple_calendar"), hk = row("apple_health");
  const connected = (c?: ConnectionStatus) => !!c && c.state !== "off" && c.state !== "unavailable";
  const status = (c?: ConnectionStatus) => (c ? STATE[c.state] : STATE.off);

  return (
    <Screen header={<ScreenHeader title="Settings" back={{ label: "You", onPress: () => router.back() }} />}>
      <View style={{ gap: space.xs }}>
        <SectionHeader title="Account" />
        <Card><Text>{profile?.email ?? ""}</Text></Card>
      </View>

      <View style={{ gap: space.xs, marginTop: space.md }}>
        <SectionHeader title="Connections" />
        <Text variant="meta" color={color.muted}>
          Ongoing connections. Rhythm shows current status, not just whether something's linked.
        </Text>
        <ConnectionRow
          name="Oura"
          status={status(oura)}
          detail={synced(oura?.last_synced_at ?? null) ?? "Readiness and sleep, read-only."}
          action={oura?.state === "expired" || !connected(oura)
            ? { label: busy === "oura" ? "Connecting…" : oura?.state === "expired" ? "Reconnect" : "Connect", onPress: connectOura, disabled: !!busy }
            : { label: "Off", variant: "secondary", onPress: run("oura", ouraDisconnect), disabled: !!busy }}
        />
        <ConnectionRow
          name="Apple Health"
          status={status(hk)}
          detail={healthAvailable() ? (synced(hk?.last_synced_at ?? null) ?? "Sleep, HRV and resting heart rate, read-only.")
            : "Needs the Rhythm app build (not Expo Go)."}
          action={{ label: busy === "health" ? "Syncing…" : connected(hk) ? "Sync" : "Connect", onPress: connectHealthKit,
                    disabled: !!busy || !healthAvailable(), variant: connected(hk) ? "secondary" : "primary" }}
        />
        <ConnectionRow
          name="Apple Calendar"
          status={status(cal)}
          detail={!connected(cal) && calAccess === "blocked"
            ? "Calendar access is off for Rhythm. Turn it on in iOS Settings, then connect."
            : synced(cal?.last_synced_at ?? null) ?? "Busy times only; event names stay on your phone. Updates on its own."}
          action={connected(cal)
            ? { label: "Off", variant: "secondary", onPress: run("calendar", () => disconnectCalendar()), disabled: !!busy }
            : calAccess === "blocked"
              ? { label: "Open Settings", variant: "secondary", onPress: () => Linking.openSettings() }
              : { label: busy === "calendar" ? "Connecting…" : "Connect", onPress: connectCal, disabled: !!busy }}
        />
        <ConnectionRow name="Google Calendar" detail="Unavailable right now."
                       action={{ label: "Unavailable", variant: "secondary", disabled: true }} />
        {error && <Text variant="meta" color="#6B2F2A">{error}</Text>}
      </View>

      <View style={{ marginTop: space.md }}>
        <SectionHeader title="Tags" linkLabel="+ New" onLinkPress={() => setSheet(true)} />
        <Card>
          {tags.length === 0 && <Text variant="meta" color={color.muted}>No tags yet.</Text>}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {tags.map((t) => t.color_family && t.color_family in pastel && (
              <TagChip key={t.id} tag={{ id: t.id, name: t.name, color: t.color_family as PastelKey }}
                       onRemove={run(`tag-${t.id}`, () => deleteArea(t.id))} />
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
        <Button variant="secondary" label="Sign out" onPress={signOut}
                accessibilityHint="Signs out on this iPhone. Your connections stay as they are." />
        <Button variant="ghost" label="Delete account" onPress={() => { setDeleteError(null); setDeleting("ask"); }} />
      </View>

      <BottomSheet visible={!!deleting} onClose={() => deleting !== "busy" && setDeleting(null)} title="Delete your account?">
        <View style={{ gap: space.sm }}>
          <Text>
            This permanently deletes your Rhythm account and everything in it: check-ins, tasks, plans, goals, health
            readings and calendar busy times. Rhythm's access to Oura is revoked. This can't be undone.
          </Text>
          <Text variant="meta" color={color.muted}>
            If you signed in with Apple, you'll confirm with Apple first. Apple Calendar and Apple Health access can be
            turned off in iOS Settings.
          </Text>
          {deleteError && <Text variant="meta" color="#6B2F2A" accessibilityLiveRegion="polite">{deleteError}</Text>}
          <Pressable
            accessibilityRole="button" accessibilityLabel="Delete my account permanently" disabled={deleting === "busy"}
            onPress={async () => {
              setDeleting("busy");
              setDeleteError(null);
              try {
                // Success signs this device out, which returns to the welcome screen.
                if (!(await deleteAccount())) setDeleting("ask");
              } catch (e) {
                setDeleteError(e instanceof Error ? e.message : "Your account wasn't deleted. Try again.");
                setDeleting("ask");
              }
            }}
            style={({ pressed }) => [{ minHeight: minTouch, borderRadius: radius.button, backgroundColor: "#6B2F2A",
                                       alignItems: "center", justifyContent: "center", marginTop: space.xs },
                                     (pressed || deleting === "busy") && { opacity: 0.8 }]}>
            <Text variant="button" color={color.white}>{deleting === "busy" ? "Deleting…" : "Delete my account"}</Text>
          </Pressable>
          <Button label="Cancel" variant="secondary" fullWidth disabled={deleting === "busy"} onPress={() => setDeleting(null)} />
        </View>
      </BottomSheet>

      <BottomSheet visible={sheet} onClose={() => setSheet(false)} title="New tag">
        <TextField value={name} onChangeText={setName} placeholder="Tag name" accessibilityLabel="Tag name" />
        <Text variant="eyebrow" color={color.muted} style={{ marginTop: space.md, marginBottom: space.xs }}>Color</Text>
        <PastelPicker value={pastelKey} onChange={setPastelKey} />
        <Button label="Create tag" fullWidth disabled={!name.trim() || !pastelKey} style={{ marginTop: space.lg }}
                onPress={run("tag-new", async () => {
                  await createArea(name.trim(), pastelKey!);
                  setSheet(false); setName(""); setPastelKey(null);
                })} />
        <Button label="Cancel" variant="secondary" fullWidth onPress={() => setSheet(false)} style={{ marginTop: space.xs }} />
      </BottomSheet>
    </Screen>
  );
}
