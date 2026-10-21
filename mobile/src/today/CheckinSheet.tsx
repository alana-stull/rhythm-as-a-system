import React, { useState } from "react";
import { View } from "react-native";
import { createCheckin } from "../api/endpoints";
import type { Demand, Level } from "../api/types";
import { BottomSheet, Button, color, ScaleSelector, space, Text } from "../design";

const LEVELS: Level[] = ["very_low", "low", "moderate", "high", "very_high"];
const DEMANDS: Demand[] = ["very_light", "light", "moderate", "heavy", "very_heavy"];
type Five = [string, string, string, string, string];
const ENERGY: Five = ["Very low", "Low", "Middling", "High", "Very high"];
const RESTED: Five = ["Not at all", "A little", "Fairly", "Well rested", "Fully rested"];
const DEMAND: Five = ["Very light", "Light", "Moderate", "Heavy", "Very heavy"];

// Quick check-in from Today. Any answer is enough; each question uses its latest answer.
export function CheckinSheet({ visible, onClose, onSaved }: { visible: boolean; onClose: () => void; onSaved: () => void }) {
  const [energy, setEnergy] = useState<number | null>(null);
  const [rested, setRested] = useState<number | null>(null);
  const [demand, setDemand] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await createCheckin({
        ...(energy ? { energy: LEVELS[energy - 1] } : {}),
        ...(rested ? { rested: LEVELS[rested - 1] } : {}),
        ...(demand ? { perceived_demand: DEMANDS[demand - 1] } : {}),
      });
      setEnergy(null); setRested(null); setDemand(null);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save your check-in.");
    } finally {
      setBusy(false);
    }
  };

  const questions: [string, number | null, (v: number) => void, Five][] = [
    ["How much energy do you have?", energy, setEnergy, ENERGY],
    ["How rested do you feel?", rested, setRested, RESTED],
    ["How heavy does today feel?", demand, setDemand, DEMAND],
  ];

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Check in">
      <View style={{ gap: space.md }}>
        {questions.map(([q, value, set, words]) => (
          <View key={q} style={{ gap: 8 }}>
            <Text variant="bodyStrong">{q}</Text>
            <ScaleSelector value={value} onChange={set} stepLabels={words} accessibilityLabel={q} />
          </View>
        ))}
        {error && <Text variant="meta" color="#6B2F2A">{error}</Text>}
        <Button label={busy ? "Saving…" : "Save"} fullWidth disabled={busy || !(energy || rested || demand)} onPress={save} />
        <Text variant="meta" color={color.muted} style={{ textAlign: "center" }}>Answer any of these. Rhythm works out the state.</Text>
      </View>
    </BottomSheet>
  );
}
