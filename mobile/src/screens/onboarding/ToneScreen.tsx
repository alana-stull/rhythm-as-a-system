import React, { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { doc, setDoc } from "firebase/firestore";
import { useAuth } from "../../auth/AuthContext";
import { db } from "../../firebase";
import { OnboardingLayout } from "../../components/OnboardingLayout";

const OPTIONS = [
  { key: "gentle", title: "Gentle", subtitle: "Soft nudges, no pressure" },
  { key: "direct", title: "Direct", subtitle: "Clear and to the point" },
  { key: "motivating", title: "Motivating", subtitle: "Push me a little" },
];

export default function ToneScreen({
  next,
  back,
  currentStep,
  totalSteps
}: {
  next: () => void;
  back: () => void;
  currentStep: number;
  totalSteps: number;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const { user } = useAuth() as any;

  const handleContinue = async () => {
    if (user?.uid) {
      await setDoc(doc(db, "users", user.uid), { promptTone: selected }, { merge: true });
    }
    next();
  };

  const progress = (currentStep / totalSteps) * 100;

  return (
    <OnboardingLayout
      progress={progress}
      showBackArrow
      question="How should Rhythm talk to you?"
      subtitle="You can change this anytime in settings."
      continueDisabled={!selected}
      onContinue={handleContinue}
      onBack={back}
    >
      <View>
        {OPTIONS.map((o) => (
          <TouchableOpacity
            key={o.key}
            onPress={() => setSelected(o.key)}
            style={{
              backgroundColor: "#FFFFFF",
              borderRadius: 12,
              borderWidth: selected === o.key ? 1.5 : 0.5,
              borderColor: selected === o.key ? "#1A1A1A" : "rgba(0,0,0,0.08)",
              padding: 16,
              marginTop: 10,
            }}
          >
            <Text style={{ fontSize: 15, fontWeight: "500", color: "#1A1A1A" }}>
              {o.title}
            </Text>
            <Text style={{ fontSize: 13, color: "#6B6B6B", marginTop: 2 }}>
              {o.subtitle}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </OnboardingLayout>
  );
}
