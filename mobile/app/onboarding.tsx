import React, { useEffect, useRef, useState } from "react";
import { Animated, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  clearPriority,
  createArea,
  createCheckin,
  createTaskWith,
  deleteArea,
  getConnections,
  getPlan,
  getToday,
  makePriority,
  updateMe,
  type ConnectionStatus,
} from "../src/api/endpoints";
import type { CheckinInput, Demand, Level, Today } from "../src/api/types";
import { useSession } from "../src/auth/SessionProvider";
import {
  Button,
  Card,
  ChecklistRow,
  CollapsedQuestionRow,
  ConnectionRow,
  DarkCallout,
  Eyebrow,
  Icon,
  OptionRow,
  PastelKey,
  PastelPicker,
  ScaleSelector,
  StateBadge,
  TagChip,
  Text,
  TextField,
  ToggleRow,
  color,
  minTouch,
  space,
} from "../src/design";
import { connectAppleHealth, connectCalendar, connectOura } from "../src/integrations/connect";
import { healthAvailable } from "../src/integrations/healthkit";
import { iso } from "../src/lib/dates";

// The Onboarding board after sign-in: nine steps, each saving what it collects.
const EYEBROWS = ["About you", "Your world", "Your days", "What matters", "On your mind",
  "Your capacity", "Your capacity", "Your systems", "Your first day"];
const STEPS = EYEBROWS.length;
const [NAME, WORLD, DAYS, MATTERS, DUMP, CAP_A, CAP_B, CONNECT, FIRST] = [0, 1, 2, 3, 4, 5, 6, 7, 8];
const SKIPPABLE = new Set([DAYS, MATTERS, DUMP, CONNECT]);

type Five = [string, string, string, string, string];
const LEVELS: Level[] = ["very_low", "low", "moderate", "high", "very_high"];
const DEMANDS: Demand[] = ["very_light", "light", "moderate", "heavy", "very_heavy"];
const ENERGY_WORDS: Five = ["Very low", "Low", "Middling", "High", "Very high"];
const DEMAND_WORDS: Five = ["Very light", "Light", "Moderate", "Heavy", "Very heavy"];
const RESTED_WORDS: Five = ["Not at all", "A little", "Fairly", "Well rested", "Fully rested"];

const LIFE_SHAPES: [string, string][] = [["ft", "Working full-time"], ["school", "In school"],
  ["freelance", "Freelance / self-employed"], ["between", "Between things right now"], ["mix", "A mix of a few of these"]];
const HELP: [string, string][] = [["capacity", "Understanding my capacity"], ["space", "Making space for what matters"],
  ["track", "Keeping track of commitments"], ["rhythms", "Building better rhythms"], ["other", "Something else"]];
const PROTECTED: [string, string][] = [["morning", "Mornings"], ["evening", "Evenings"], ["weekend", "Weekends"], ["varies", "It varies"]];
const REST: [string, string][] = [["heavy", "After a heavy day"], ["weekly", "Weekly, on a set day"], ["none", "I don’t really protect this yet"]];
const AFFECTING: [string, string][] = [["sleep", "Sleep"], ["stress", "Stress"], ["illness", "Illness"],
  ["emotions", "Big emotions"], ["none", "Nothing in particular"]];
const SUGGESTED_TAGS: [string, PastelKey][] = [["Friends & relationships", "blush"], ["Creative project", "lilac"],
  ["Rest", "seafoam"], ["Learning", "sky"]];
const PROTECTED_WORDS: Record<string, string> = { morning: "your mornings", evening: "your evenings", weekend: "your weekends" };

type LocalTag = { label: string; color: PastelKey; id?: string };
type DumpItem = { key: string; label: string; id?: string };

const label = (pairs: [string, string][], key: string | null) => pairs.find(([k]) => k === key)?.[1] ?? "";

function ProgressBar({ step }: { step: number }) {
  const width = useRef(new Animated.Value((step + 1) / STEPS)).current;
  useEffect(() => {
    Animated.timing(width, { toValue: (step + 1) / STEPS, duration: 240, useNativeDriver: false }).start();
  }, [step, width]);
  return (
    <View style={styles.track} accessibilityRole="progressbar"
          accessibilityValue={{ min: 1, max: STEPS, now: step + 1, text: `Step ${step + 1} of ${STEPS}` }}>
      <Animated.View style={[styles.fill, { width: width.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }]} />
    </View>
  );
}

function Question({ children }: { children: React.ReactNode }) {
  return <Text variant="question" accessibilityRole="header" style={{ marginBottom: 4 }}>{children}</Text>;
}
function Hint({ children }: { children: React.ReactNode }) {
  return <Text variant="meta" color={color.muted} style={{ marginBottom: space.sm }}>{children}</Text>;
}

export default function Onboarding() {
  const { profile, setProfile } = useSession();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // About you / world / days → profile.onboarding_answers
  const saved = (profile?.onboarding_answers ?? {}) as Record<string, any>;
  const [name, setName] = useState(profile?.display_name ?? "");
  const [lifeShape, setLifeShape] = useState<string | null>(saved.life_shape ?? null);
  const [help, setHelp] = useState<string[]>(saved.help ?? []);
  const [worldOpen, setWorldOpen] = useState(0);
  const [resp, setResp] = useState<string[]>(saved.responsibilities ?? []);
  const [respInput, setRespInput] = useState("");
  const [protectedTime, setProtectedTime] = useState<string | null>(saved.protected_time ?? null);
  const [restPattern, setRestPattern] = useState<string | null>(saved.rest_pattern ?? null);
  const [daysOpen, setDaysOpen] = useState(0);

  // What matters → tags; on your mind → tasks
  const [tags, setTags] = useState<LocalTag[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [tagColor, setTagColor] = useState<PastelKey | null>(null);
  const [dump, setDump] = useState<DumpItem[]>([]);
  const [dumpInput, setDumpInput] = useState("");

  // Capacity → check-ins
  const [energy, setEnergy] = useState<number | null>(null);
  const [demand, setDemand] = useState<number | null>(null);
  const [energyOpen, setEnergyOpen] = useState(true);
  const [rested, setRested] = useState<number | null>(null);
  const [affecting, setAffecting] = useState<string[]>([]);
  const [restedOpen, setRestedOpen] = useState(true);

  // Systems + first day
  const [conns, setConns] = useState<Record<string, ConnectionStatus>>({});
  const [titlesOk, setTitlesOk] = useState(!!profile?.ai_task_titles_consented);
  const [today, setToday] = useState<Today | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const answers = { life_shape: lifeShape, help, responsibilities: resp, protected_time: protectedTime, rest_pattern: restPattern };

  const refreshConnections = async () => {
    const c = await getConnections().catch(() => []);
    setConns(Object.fromEntries(c.map((x) => [x.provider, x])));
  };

  const loadFirstDay = async () => {
    const [t, plan] = await Promise.all([getToday(), getPlan(iso(new Date()), 1)]);
    setToday(t);
    const now = Date.now();
    const parts: string[] = [];
    const ahead = plan.items.filter((i) => !i.all_day && i.kind !== "protected" && new Date(i.starts_at).getTime() > now).length;
    if (t.schedule.calendar_connected) parts.push(`${ahead || "No"} more commitment${ahead === 1 ? "" : "s"} on your calendar today`);
    if (plan.open_windows) parts.push(`${plan.open_windows.length || "no"} open window${plan.open_windows.length === 1 ? "" : "s"} left`);
    if (protectedTime && PROTECTED_WORDS[protectedTime]) parts.push(`${PROTECTED_WORDS[protectedTime]} protected`);
    setSummary(parts.length
      ? `${parts.join(", ").replace(/, ([^,]*)$/, ", and $1")} — based on what you just told us.`
      : "Rhythm will fill in your day as you check in and connect a calendar.");
  };

  useEffect(() => {
    if (step === CAP_B) getToday().then(setToday).catch(() => {});
    if (step === CONNECT) refreshConnections();
    if (step === FIRST) loadFirstDay().catch(() => setSummary(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Saves what this step collected. Skipping saves nothing.
  const save = async () => {
    if (step === NAME) setProfile(await updateMe({ display_name: name.trim() }));
    if (step === WORLD || step === DAYS) setProfile(await updateMe({ onboarding_answers: answers }));
    if (step === MATTERS) {
      const next = [...tags];
      for (const [i, t] of next.entries()) if (!t.id) next[i] = { ...t, id: (await createArea(t.label, t.color)).id };
      setTags(next);
    }
    if (step === DUMP) {
      const next = [...dump];
      for (const [i, d] of next.entries()) {
        if (!d.id) next[i] = { ...d, id: (await createTaskWith({ title: d.label, source: "brain_dump" })).id };
      }
      setDump(next);
    }
    if (step === CAP_A && (energy || demand)) {
      await createCheckin({ ...(energy ? { energy: LEVELS[energy - 1] } : {}),
                            ...(demand ? { perceived_demand: DEMANDS[demand - 1] } : {}) });
    }
    if (step === CAP_B && rested) {
      await createCheckin({ rested: LEVELS[rested - 1], context_tags: affecting.filter((a) => a !== "none") as CheckinInput["context_tags"] });
    }
    if (step === CONNECT && titlesOk !== !!profile?.ai_task_titles_consented) {
      setProfile(await updateMe({ ai_task_titles_consented: titlesOk }));
    }
    if (step === FIRST) setProfile(await updateMe({ onboarding_completed: true })); // the gate opens the app
  };

  const go = async (skip = false) => {
    setBusy(true);
    setError(null);
    try {
      if (!skip) await save();
      if (step < STEPS - 1) setStep((s) => s + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const connect = (fn: () => Promise<void>) => async () => {
    setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "That didn't connect."); }
    refreshConnections();
  };

  const togglePriority = async (id: string) => {
    const on = picked.has(id);
    if (!on && picked.size >= 3) return;
    const next = new Set(picked);
    on ? next.delete(id) : next.add(id);
    setPicked(next);
    try { await (on ? clearPriority(id) : makePriority(id)); } catch (e) {
      setPicked(picked);
      setError(e instanceof Error ? e.message : "That didn't save.");
    }
  };

  const capState = today?.capacity;
  const capBadge = capState && capState.status !== "insufficient_evidence"
    ? <StateBadge state={capState.status === "uncertain" ? "Uncertain" : capState.state!} /> : null;

  const body = (() => {
    switch (step) {
      case NAME:
        return (
          <>
            <Question>What should we call you?</Question>
            <TextField value={name} onChangeText={setName} placeholder="Your name" accessibilityLabel="Your name" autoFocus
                       textContentType="givenName" returnKeyType="next" onSubmitEditing={() => name.trim() && go()}
                       style={{ marginTop: space.sm }} />
          </>
        );
      case WORLD:
        return (
          <>
            {worldOpen > 0 && <CollapsedQuestionRow question="What does your life look like right now?"
                                                    answer={label(LIFE_SHAPES, lifeShape)} onPress={() => setWorldOpen(0)} />}
            {worldOpen === 0 ? (
              <>
                <Question>What does your life look like right now?</Question>
                <Hint>Pick what's closest — there's no wrong shape.</Hint>
                {LIFE_SHAPES.map(([k, l]) => (
                  <OptionRow key={k} label={l} selected={lifeShape === k} onPress={() => { setLifeShape(k); setWorldOpen(1); }} />
                ))}
              </>
            ) : (
              <View style={{ marginTop: space.md }}>
                <Question>What are you hoping Rhythm helps with?</Question>
                <Hint>Pick as many as apply.</Hint>
                {HELP.map(([k, l]) => (
                  <OptionRow key={k} multi label={l} selected={help.includes(k)}
                             onPress={() => setHelp((h) => (h.includes(k) ? h.filter((x) => x !== k) : [...h, k]))} />
                ))}
              </View>
            )}
          </>
        );
      case DAYS:
        return (
          <>
            <Question>What shapes your days?</Question>
            <Hint>Light touch — you can add detail anytime later.</Hint>
            {daysOpen > 0 && <CollapsedQuestionRow question="Recurring responsibilities"
                                                   answer={resp.length ? `${resp.length} added` : "None added"} onPress={() => setDaysOpen(0)} />}
            {daysOpen === 0 && (
              <View>
                <Text variant="bodyStrong" style={{ marginBottom: space.xs }}>Recurring responsibilities</Text>
                <View style={styles.chips}>
                  {resp.map((r) => (
                    <View key={r} style={styles.plainChip}>
                      <Text variant="metaStrong">{r}</Text>
                      <Pressable onPress={() => setResp((x) => x.filter((y) => y !== r))} hitSlop={10}
                                 accessibilityRole="button" accessibilityLabel={`Remove ${r}`}>
                        <Icon name="close" size={11} color={color.muted} />
                      </Pressable>
                    </View>
                  ))}
                </View>
                <View style={styles.inputRow}>
                  <TextField value={respInput} onChangeText={setRespInput} placeholder="e.g. Evening classes" style={{ flex: 1 }}
                             accessibilityLabel="Add a responsibility" returnKeyType="done"
                             onSubmitEditing={() => { if (respInput.trim()) { setResp((x) => [...x, respInput.trim()]); setRespInput(""); } }} />
                  <Button label="Add" size="sm" disabled={!respInput.trim()}
                          onPress={() => { setResp((x) => [...x, respInput.trim()]); setRespInput(""); }} />
                </View>
                <Button label="Next question →" variant="ghost" onPress={() => setDaysOpen(1)} style={{ marginTop: space.sm }} />
              </View>
            )}
            {daysOpen > 1 && <CollapsedQuestionRow question="When do you protect time for yourself?"
                                                   answer={label(PROTECTED, protectedTime)} onPress={() => setDaysOpen(1)} />}
            {daysOpen === 1 && (
              <View style={{ marginTop: space.md }}>
                <Text variant="bodyStrong" style={{ marginBottom: space.xs }}>When do you protect time for yourself?</Text>
                {PROTECTED.map(([k, l]) => (
                  <OptionRow key={k} label={l} selected={protectedTime === k} onPress={() => { setProtectedTime(k); setDaysOpen(2); }} />
                ))}
              </View>
            )}
            {daysOpen === 2 && (
              <View style={{ marginTop: space.md }}>
                <Text variant="bodyStrong" style={{ marginBottom: space.xs }}>When do you usually need rest?</Text>
                {REST.map(([k, l]) => <OptionRow key={k} label={l} selected={restPattern === k} onPress={() => setRestPattern(k)} />)}
              </View>
            )}
          </>
        );
      case MATTERS:
        return (
          <>
            <Question>What do you want to make space for?</Question>
            <Hint>Your own categories — not just Work and School. These become your tags everywhere in Rhythm.</Hint>
            <View style={styles.chips}>
              {tags.map((t) => (
                <TagChip key={t.label} tag={{ id: t.label, name: t.label, color: t.color }} onRemove={async () => {
                  setTags((x) => x.filter((y) => y.label !== t.label));
                  if (t.id) await deleteArea(t.id).catch(() => {});
                }} />
              ))}
            </View>
            <Text variant="meta" color={color.muted} style={{ marginVertical: space.xs }}>Tap to add a suggestion, or write your own below.</Text>
            <View style={styles.chips}>
              {SUGGESTED_TAGS.filter(([l]) => !tags.some((t) => t.label === l)).map(([l, c]) => (
                <Pressable key={l} onPress={() => setTags((x) => [...x, { label: l, color: c }])} accessibilityRole="button"
                           accessibilityLabel={`Add ${l}`} style={styles.suggestion}>
                  <Text variant="metaStrong">+ {l}</Text>
                </Pressable>
              ))}
            </View>
            <TextField value={tagInput} onChangeText={setTagInput} placeholder="Name your own" accessibilityLabel="New tag name"
                       style={{ marginTop: space.md }} />
            <View style={{ marginTop: space.sm }}><PastelPicker value={tagColor} onChange={setTagColor} /></View>
            <Button label="Add" size="sm" disabled={!tagInput.trim() || !tagColor} style={{ alignSelf: "flex-start", marginTop: space.sm }}
                    onPress={() => { setTags((x) => [...x, { label: tagInput.trim(), color: tagColor! }]); setTagInput(""); setTagColor(null); }} />
          </>
        );
      case DUMP:
        return (
          <>
            <Question>Get it all out.</Question>
            <Hint>Tasks, deadlines, things on your mind — add them one at a time. Sort them later.</Hint>
            <View style={styles.inputRow}>
              <TextField value={dumpInput} onChangeText={setDumpInput} placeholder="Type something and add it" style={{ flex: 1 }}
                         accessibilityLabel="Something on your mind" returnKeyType="done" blurOnSubmit={false}
                         onSubmitEditing={() => { if (dumpInput.trim()) { setDump((x) => [...x, { key: `${Date.now()}`, label: dumpInput.trim() }]); setDumpInput(""); } }} />
              <Button label="Add" size="sm" disabled={!dumpInput.trim()}
                      onPress={() => { setDump((x) => [...x, { key: `${Date.now()}`, label: dumpInput.trim() }]); setDumpInput(""); }} />
            </View>
            <Card padding="list" style={{ marginTop: space.sm }}>
              {dump.length === 0 && <Text variant="meta" color={color.muted} style={{ padding: space.sm }}>Nothing yet — add the first thing on your mind.</Text>}
              {dump.map((d) => (
                <View key={d.key} style={styles.dumpRow}>
                  <Text style={{ flex: 1 }}>{d.label}</Text>
                  <Pressable onPress={() => setDump((x) => x.filter((y) => y.key !== d.key))} hitSlop={10}
                             accessibilityRole="button" accessibilityLabel={`Remove ${d.label}`} disabled={!!d.id}>
                    {!d.id && <Icon name="close" size={13} color={color.muted} />}
                  </Pressable>
                </View>
              ))}
            </Card>
            <Text variant="meta" color={color.muted} style={{ marginTop: space.xs }}>Effort and timing are optional — Rhythm won't invent them for you.</Text>
          </>
        );
      case CAP_A:
        return (
          <>
            <Hint>Answer about your experience — Rhythm works out the state.</Hint>
            {energyOpen ? (
              <View>
                <Question>How much energy do you have today?</Question>
                <View style={{ marginTop: space.xs }}>
                  <ScaleSelector value={energy} onChange={(v) => { setEnergy(v); setEnergyOpen(false); }} stepLabels={ENERGY_WORDS}
                                 accessibilityLabel="How much energy do you have today?" />
                </View>
              </View>
            ) : (
              <>
                <CollapsedQuestionRow question="How much energy do you have today?"
                                      answer={energy ? `${energy} of 5 — ${ENERGY_WORDS[energy - 1]}` : ""} onPress={() => setEnergyOpen(true)} />
                <View style={{ marginTop: space.md }}>
                  <Question>How heavy does today feel?</Question>
                  <View style={{ marginTop: space.xs }}>
                    <ScaleSelector value={demand} onChange={setDemand} stepLabels={DEMAND_WORDS} accessibilityLabel="How heavy does today feel?" />
                  </View>
                </View>
              </>
            )}
          </>
        );
      case CAP_B:
        return (
          <>
            {restedOpen ? (
              <View>
                <Question>How rested do you feel?</Question>
                <View style={{ marginTop: space.xs }}>
                  <ScaleSelector value={rested} onChange={(v) => { setRested(v); setRestedOpen(false); }} stepLabels={RESTED_WORDS}
                                 accessibilityLabel="How rested do you feel?" />
                </View>
              </View>
            ) : (
              <>
                <CollapsedQuestionRow question="How rested do you feel?" answer={rested ? `${rested} of 5 — ${RESTED_WORDS[rested - 1]}` : ""}
                                      onPress={() => setRestedOpen(true)} />
                <View style={{ marginTop: space.md }}>
                  <Text variant="bodyStrong">Anything affecting your energy today?</Text>
                  <Hint>Optional — pick as many as apply.</Hint>
                  {AFFECTING.map(([k, l]) => (
                    <OptionRow key={k} multi label={l} selected={affecting.includes(k)}
                               onPress={() => setAffecting((a) => (k === "none" ? (a.includes("none") ? [] : ["none"])
                                 : a.includes(k) ? a.filter((x) => x !== k) : [...a.filter((x) => x !== "none"), k]))} />
                  ))}
                </View>
              </>
            )}
            {capBadge && (
              <Card style={{ marginTop: space.md }}>
                <Eyebrow style={{ marginBottom: space.xs }}>Based on your check-in</Eyebrow>
                {capBadge}
              </Card>
            )}
          </>
        );
      case CONNECT: {
        const row = (p: string) => conns[p];
        const on = (c?: ConnectionStatus) => !!c && c.state !== "off" && c.state !== "unavailable";
        return (
          <>
            <Question>Connect what you'd like</Question>
            <Hint>These stay connected until you disconnect them — not a one-time import. Optional, and skippable.</Hint>
            <View style={{ gap: space.xs }}>
              <ConnectionRow name="Oura" detail="Readiness feeds your capacity view, synced ongoing and attributed to Oura."
                             action={on(row("oura")) ? { label: "Connected", variant: "secondary", disabled: true }
                               : { label: "Connect", onPress: connect(connectOura) }} />
              <ConnectionRow name="Apple Health" detail={healthAvailable() ? "Sleep and heart trends, read-only, updated as new data arrives."
                               : "Available in the Rhythm app build."}
                             action={on(row("apple_health")) ? { label: "Connected", variant: "secondary", disabled: true }
                               : { label: "Connect", onPress: connect(connectAppleHealth), disabled: !healthAvailable() }} />
              <ConnectionRow name="Apple Calendar" detail="Your busy times show on Today and Plan. Event names stay on your phone."
                             action={on(row("apple_calendar")) ? { label: "Connected", variant: "secondary", disabled: true }
                               : { label: "Connect", onPress: connect(connectCalendar) }} />
              <ConnectionRow name="Google Calendar" detail="Temporarily unavailable." action={{ label: "Unavailable", variant: "secondary", disabled: true }} />
            </View>
            <Card style={{ marginTop: space.md }}>
              <ToggleRow label="Let Rhythm's suggestions use task names" value={titlesOk} onChange={setTitlesOk}
                         detail="When on, the name of a task Rhythm suggests may be sent to OpenAI to word that suggestion. Health data, notes and calendar event names never are. You can change this in Settings." />
            </Card>
          </>
        );
      }
      case FIRST:
        return (
          <>
            <Question>Your first day.</Question>
            <Hint>Built from what you just shared.</Hint>
            {capBadge ? (
              <View style={{ marginBottom: space.md }}>{capBadge}</View>
            ) : (
              <Card style={{ marginBottom: space.md }}>
                <Text>Not enough to assess capacity yet — that's fine, Rhythm can still help you plan today.</Text>
              </Card>
            )}
            <Text variant="bodyStrong" style={{ marginBottom: space.xs }}>Choose today's priorities</Text>
            <Card padding="list" style={{ marginBottom: space.md }}>
              {dump.filter((d) => d.id).length === 0 && (
                <Text variant="meta" color={color.muted} style={{ padding: space.sm }}>Nothing to pick from yet — that's okay.</Text>
              )}
              {dump.filter((d) => d.id).map((d) => (
                <ChecklistRow key={d.id} label={d.label} shape="square" checked={picked.has(d.id!)} onToggle={() => togglePriority(d.id!)} />
              ))}
            </Card>
            {summary && (
              <DarkCallout eyebrow="Today, roughly"><Text color={color.onInk}>{summary}</Text></DarkCallout>
            )}
          </>
        );
    }
  })();

  return (
    <SafeAreaView style={styles.root}>
      <ProgressBar step={step} />
      <View style={styles.top}>
        {step > 0 ? (
          <Pressable onPress={() => { setError(null); setStep((x) => x - 1); }} accessibilityRole="button" accessibilityLabel="Back" style={styles.back}>
            <Icon name="chevronLeft" size={18} color={color.muted} strokeWidth={2.2} />
          </Pressable>
        ) : <View style={{ height: minTouch }} />}
        <Eyebrow tone="accent">{EYEBROWS[step]}</Eyebrow>
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {body}
        {error && <Text variant="meta" color="#6B2F2A" style={{ marginTop: space.sm }} accessibilityLiveRegion="polite">{error}</Text>}
      </ScrollView>
      <View style={styles.footer}>
        <Button label={busy ? "Saving…" : step === FIRST ? "Enter Rhythm" : "Continue"} fullWidth
                disabled={busy || (step === NAME && !name.trim())} onPress={() => go()} />
        {SKIPPABLE.has(step) && (
          <Button label="Skip for now" variant="ghost" onPress={() => go(true)} disabled={busy}
                  style={{ alignSelf: "center", marginTop: space.sm }} />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.cream },
  track: { height: 4, marginHorizontal: space.gutter, marginTop: space.xs, borderRadius: 2, backgroundColor: color.hairline, overflow: "hidden" },
  fill: { height: 4, borderRadius: 2, backgroundColor: color.amber },
  top: { paddingHorizontal: space.gutter, paddingTop: 2, gap: 2 },
  back: { width: minTouch, height: minTouch, justifyContent: "center", marginLeft: -12, paddingLeft: 12 },
  body: { paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.lg },
  footer: { paddingHorizontal: space.lg, paddingBottom: space.md },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  plainChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 7, paddingLeft: 12, paddingRight: 9,
               borderRadius: 8, backgroundColor: color.surface, borderWidth: 1, borderColor: color.border },
  suggestion: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: color.surface,
                borderWidth: 1, borderStyle: "dashed", borderColor: color.borderStrong },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: space.sm },
  dumpRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, paddingHorizontal: space.sm, minHeight: minTouch },
});
