import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
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

// The ten steps from the Onboarding board. P0 builds the frame (eyebrow, back,
// Continue/Skip) and two representative steps; the rest are placeholders.
const STEPS = [
  { eyebrow: "", title: "" },
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

const SKIPPABLE = new Set([3, 4, 5, 8]);
const ENERGY = ["Very low", "Low", "Middling", "High", "Very high"] as [string, string, string, string, string];
const DEMAND = ["Very light", "Light", "Moderate", "Heavy", "Very heavy"] as [string, string, string, string, string];

export default function Onboarding() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [energy, setEnergy] = useState<number | null>(null);
  const [demand, setDemand] = useState<number | null>(null);
  const [energyOpen, setEnergyOpen] = useState(true);
  const last = STEPS.length - 1;
  const next = () => (step === last ? router.back() : setStep((s) => s + 1));

  if (step === 0) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.welcome}>
          <Text variant="section" style={{ marginBottom: 6 }}>Rhythm</Text>
          <Text variant="display" accessibilityRole="header" style={{ marginBottom: 14 }}>
            What you have to give, alongside what life asks of you.
          </Text>
          <Text style={{ marginBottom: space.lg }}>
            Rhythm helps you see your capacity and your commitments together, so you can make more intentional decisions
            about your day — not just a longer to-do list.
          </Text>
          <Button label="Continue with email" onPress={next} />
        </View>
      </SafeAreaView>
    );
  }

  const s = STEPS[step];
  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.top}>
        <Pressable onPress={() => setStep((x) => x - 1)} accessibilityRole="button" accessibilityLabel="Back" style={styles.back}>
          <Icon name="chevronLeft" size={18} color={color.muted} strokeWidth={2.2} />
        </Pressable>
        <Eyebrow tone="accent">{s.eyebrow}</Eyebrow>
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {step === 6 ? (
          <View style={{ gap: space.md }}>
            <Text variant="meta" color={color.muted}>Answer about your experience — Rhythm works out the state.</Text>
            {energyOpen ? (
              <View>
                <Text variant="question" accessibilityRole="header" style={{ marginBottom: 10 }}>{s.title}</Text>
                <ScaleSelector
                  value={energy}
                  onChange={(v) => { setEnergy(v); setEnergyOpen(false); }}
                  stepLabels={ENERGY}
                  accessibilityLabel={s.title}
                />
              </View>
            ) : (
              <>
                <CollapsedQuestionRow
                  question={s.title}
                  answer={energy ? `${energy} of 5 — ${ENERGY[energy - 1]}` : ""}
                  onPress={() => setEnergyOpen(true)}
                />
                <View>
                  <Text variant="question" accessibilityRole="header" style={{ marginBottom: 10 }}>How heavy does today feel?</Text>
                  <ScaleSelector value={demand} onChange={setDemand} stepLabels={DEMAND} accessibilityLabel="How heavy does today feel?" />
                </View>
              </>
            )}
          </View>
        ) : (
          <View style={{ gap: space.md }}>
            <Text variant="title" accessibilityRole="header">{s.title}</Text>
            {step === 1 && <TextField value={name} onChangeText={setName} placeholder="Your name" accessibilityLabel="Your name" autoFocus />}
            {step !== 1 && <ShellNote>Step {step + 1} of {STEPS.length} — content follows the Onboarding board.</ShellNote>}
          </View>
        )}
      </ScrollView>
      {step !== last ? (
        <View style={styles.footer}>
          <Button label="Continue" fullWidth onPress={next} />
          {SKIPPABLE.has(step) && <Button label="Skip for now" variant="ghost" onPress={next} style={{ alignSelf: "center", marginTop: space.sm }} />}
        </View>
      ) : (
        <View style={styles.footer}>
          <Button label="Enter Rhythm" fullWidth onPress={next} />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.cream },
  welcome: { flex: 1, justifyContent: "center", paddingHorizontal: space.lg },
  top: { paddingHorizontal: space.gutter, paddingTop: space.xs, gap: 4 },
  back: { width: minTouch, height: minTouch, justifyContent: "center", marginLeft: -12, paddingLeft: 12 },
  body: { paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.lg },
  footer: { paddingHorizontal: space.lg, paddingBottom: space.md },
});
