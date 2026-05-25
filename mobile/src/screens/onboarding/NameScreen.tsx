import React, { useState } from "react";
import { TextInput } from "react-native";
import { doc, setDoc } from "firebase/firestore";
import { useAuth } from "../../auth/AuthContext";
import { db } from "../../firebase";
import { OnboardingLayout } from "../../components/OnboardingLayout";

export default function NameScreen({
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
  const [name, setName] = useState("");
  const { user } = useAuth() as any;

  const handleContinue = async () => {
    if (user?.uid) {
      await setDoc(doc(db, "users", user.uid), { name }, { merge: true });
    }
    next();
  };

  const progress = (currentStep / totalSteps) * 100;

  return (
    <OnboardingLayout
      progress={progress}
      showBackArrow
      question="What should we call you?"
      subtitle="We'll personalize your experience"
      continueDisabled={!name}
      onContinue={handleContinue}
      onBack={back}
    >
      <TextInput
        style={{
          width: "100%",
          height: 56,
          backgroundColor: "#FFFFFF",
          borderRadius: 12,
          paddingHorizontal: 16,
          borderWidth: 0.5,
          borderColor: "rgba(0,0,0,0.1)",
          fontSize: 16,
        }}
        placeholder="First name"
        autoFocus
        value={name}
        onChangeText={setName}
        placeholderTextColor="#C0C0C0"
      />
    </OnboardingLayout>
  );
}
