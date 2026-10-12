import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { createCheckin, updateMe } from "../src/api/endpoints";
import type { Demand, Level } from "../src/api/types";
import { useSession } from "../src/auth/SessionProvider";
import {
  Button,
  CollapsedQuestionRow,
  Eyebrow,
  Icon,
  ScaleSelector,
  Text,
  TextField,
  color,
  minTouch,
  space,
} from "../src/design";
import { ShellNote } from "../src/shell/ShellNote";

// The Onboarding board's steps after sign-in. Wired: name, the capacity
// check-in (energy, demand, rested) and completion. Other steps are frames
// until the full onboarding build.
const STEPS = [
  { eyebrow: "About you", title: "What should we call you?" },
  { eyebrow: "Your world", title: "What does your life look like right now?" },
  { eyebrow: "Your days", title: "What shapes your days?" },
  { eyebrow: "What matters", title: "What do you want to make space for?" },
  { eyebrow: "On your mind", title: "Get it all out." },
  { eyebrow: "Your capacity", title: "How much energy do you have today?" },
  { eyebrow: "Your capacity", title: "How rested do you feel?" },
  { eyebrow: "Your systems", title: "Connect what you'd like" },
  { eyebrow: "Your first day", title: "Your first day." },
] as const;

const NAME = 0, ENERGY = 5, RESTED = 6, LAST = STEPS.length - 1;
const SKIPPABLE = new Set([2, 3, 4, 7]);
const LEVELS: Level[] = ["very_low", "low", "moderate", "high", "very_high"];
const DEMANDS: Demand[] = ["very_light", "light", "moderate", "heavy", "very_heavy"];
const ENERGY_WORDS = ["Very low", "Low", "Middling", "High", "Very high"] as [string, string, string, string, string];
const DEMAND_WORDS = ["Very light", "Light", "Moderate", "Heavy", "Very heavy"] as [string, string, string, string, string];
const RESTED_WORDS = ["Not at all", "A little", "Fairly", "Well rested", "Fully rested"] as [string, string, string, string, string];

export default function Onboarding() {
  const { profile, setProfile, signOut } = useSession();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(profile?.display_name ?? "");
  const [energy, setEnergy] = useState<number | null>(null);
  const [demand, setDemand] = useState<number | null>(null);
  const [rested, setRested] = useState<number | null>(null);
  const [energyOpen, setEnergyOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Saves what this step collected, then moves on. Nothing is saved for skipped steps.
  const save = async () => {
    if (step === NAME && name.trim()) setProfile(await updateMe({ display_name: name.trim() }));
    if (step === ENERGY && (energy || demand)) {
      await createCheckin({
        ...(energy ? { energy: LEVELS[energy - 1] } : {}),
        ...(demand ? { perceived_demand: DEMANDS[demand - 1] } : {}),
      });
    }
    if (step === RESTED && rested) await createCheckin({ rested: LEVELS[rested - 1] });
    if (step === LAST) setProfile(await updateMe({ onboarding_completed: true }));  // the gate opens the app
  };

  const next = async (skip = false) => {
    setBusy(true);
    setError(null);
    try {
      if (!skip) await save();
      if (step < LAST) setStep((s) => s + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const s = STEPS[step];
  const canContinue = step !== NAME || name.trim().length > 0;

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.top}>
        {step > 0 ? (
          <Pressable onPress={() => setStep((x) => x - 1)} accessibilityRole="button" accessibilityLabel="Back" style={styles.back}>
            <Icon name="chevronLeft" size={18} color={color.muted} strokeWidth={2.2} />
          </Pressable>
        ) : (
          <Button label="Sign out" variant="ghost" onPress={signOut} style={{ minHeight: minTouch, justifyContent: "center" }} />
        )}
        <Eyebrow tone="accent">{s.eyebrow}</Eyebrow>
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {step === ENERGY ? (
          <View style={{ gap: space.md }}>
            <Text variant="meta" color={color.muted}>Answer about your experience — Rhythm works out the state.</Text>
            {energyOpen ? (
              <View>
                <Text variant="question" accessibilityRole="header" style={{ marginBottom: 10 }}>{s.title}</Text>
                <ScaleSelector value={energy} onChange={(v) => { setEnergy(v); setEnergyOpen(false); }}
                               stepLabels={ENERGY_WORDS} accessibilityLabel={s.title} />
              </View>
            ) : (
              <>
                <CollapsedQuestionRow question={s.title} answer={energy ? `${energy} of 5 — ${ENERGY_WORDS[energy - 1]}` : ""}
                                      onPress={() => setEnergyOpen(true)} />
                <View>
                  <Text variant="question" accessibilityRole="header" style={{ marginBottom: 10 }}>How heavy does today feel?</Text>
                  <ScaleSelector value={demand} onChange={setDemand} stepLabels={DEMAND_WORDS}
                                 accessibilityLabel="How heavy does today feel?" />
                </View>
              </>
            )}
          </View>
        ) : step === RESTED ? (
          <View>
            <Text variant="question" accessibilityRole="header" style={{ marginBottom: 10 }}>{s.title}</Text>
            <ScaleSelector value={rested} onChange={setRested} stepLabels={RESTED_WORDS} accessibilityLabel={s.title} />
          </View>
        ) : (
          <View style={{ gap: space.md }}>
            <Text variant="title" accessibilityRole="header">{s.title}</Text>
            {step === NAME && (
              <TextField value={name} onChangeText={setName} placeholder="Your name" accessibilityLabel="Your name"
                         autoFocus textContentType="givenName" returnKeyType="next" onSubmitEditing={() => canContinue && next()} />
            )}
            {step !== NAME && <ShellNote>Step {step + 1} of {STEPS.length} — content follows the Onboarding board.</ShellNote>}
          </View>
        )}
        {error && <Text variant="meta" color="#6B2F2A" style={{ marginTop: space.sm }}>{error}</Text>}
      </ScrollView>
      <View style={styles.footer}>
        <Button label={busy ? "Saving…" : step === LAST ? "Enter Rhythm" : "Continue"} fullWidth
                disabled={busy || !canContinue} onPress={() => next()} />
        {SKIPPABLE.has(step) && (
          <Button label="Skip for now" variant="ghost" onPress={() => next(true)} disabled={busy}
                  style={{ alignSelf: "center", marginTop: space.sm }} />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.cream },
  top: { paddingHorizontal: space.gutter, paddingTop: space.xs, gap: 4 },
  back: { width: minTouch, height: minTouch, justifyContent: "center", marginLeft: -12, paddingLeft: 12 },
  body: { paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.lg },
  footer: { paddingHorizontal: space.lg, paddingBottom: space.md },
});
