import React, { useState } from "react";
import { Text, TouchableOpacity, View, Linking } from "react-native";
import { doc, setDoc } from "firebase/firestore";
import { useAuth } from "../../auth/AuthContext";
import { db } from "../../firebase";
import { OnboardingLayout } from "../../components/OnboardingLayout";

export default function OuraSignInScreen({
  next,
  back,
  currentStep,
  totalSteps,
}: {
  next: () => void;
  back: () => void;
  currentStep: number;
  totalSteps: number;
}) {
  const [connected, setConnected] = useState(false);
  const { user } = useAuth() as any;

  const handleConnect = async () => {
    // In a real app, this would open Oura's OAuth flow
    // For now, we'll just mark it as connected
    setConnected(true);
    if (user?.uid) {
      await setDoc(
        doc(db, "users", user.uid),
        { dataSource: "Oura" },
        { merge: true }
      );
    }
  };

  const progress = (currentStep / totalSteps) * 100;

  return (
    <OnboardingLayout
      progress={progress}
      showBackArrow
      question="Connect your Oura Ring"
      subtitle="Sync your sleep and recovery data"
      continueDisabled={!connected}
      onContinue={next}
      onBack={back}
    >
      <View style={{ gap: 12 }}>
        <View
          style={{
            backgroundColor: "#F5F5F5",
            borderRadius: 12,
            padding: 16,
            gap: 8,
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: "500", color: "#1A1A1A" }}>
            ✓ Account created
          </Text>
          <Text style={{ fontSize: 14, color: "#6B6B6B", lineHeight: 20 }}>
            We'll securely connect your Oura account to pull your sleep and
            recovery data.
          </Text>
        </View>

        {!connected && (
          <>
            <TouchableOpacity
              style={{
                backgroundColor: "#FFFFFF",
                borderRadius: 12,
                borderWidth: 0.5,
                borderColor: "rgba(0,0,0,0.1)",
                padding: 16,
                alignItems: "center",
              }}
              onPress={handleConnect}
            >
              <Text style={{ fontSize: 15, fontWeight: "500", color: "#C27E3A" }}>
                Connect Oura Account
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => Linking.openURL("https://oura.com")}>
              <Text
                style={{
                  fontSize: 14,
                  color: "#6B6B6B",
                  textAlign: "center",
                  textDecorationLine: "underline",
                }}
              >
                Don't have an Oura account?
              </Text>
            </TouchableOpacity>
          </>
        )}

        {connected && (
          <View
            style={{
              backgroundColor: "#E8F5EC",
              borderRadius: 12,
              padding: 16,
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 15, fontWeight: "500", color: "#2D6A42" }}>
              ✓ Oura connected
            </Text>
          </View>
        )}
      </View>
    </OnboardingLayout>
  );
}
