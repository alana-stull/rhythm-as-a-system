import React from "react";
import { doc, setDoc } from "firebase/firestore";
import { useAuth } from "../../auth/AuthContext";
import { db } from "../../firebase";
import { OnboardingLayout } from "../../components/OnboardingLayout";

export default function DoneScreen() {
  const { user, userName } = useAuth() as any;

  const handleFinish = async () => {
    if (user?.uid) {
      await setDoc(doc(db, "users", user.uid), { onboardingComplete: true }, { merge: true });
    }
  };

  return (
    <OnboardingLayout
      progress={100}
      showBackArrow={false}
      question={`Hi ${userName || "there"}.`}
      subtitle="Let's find your rhythm."
      onContinue={handleFinish}
    >
      <></>
    </OnboardingLayout>
  );
}
