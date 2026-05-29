import React, { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { OnboardingLayout } from "../../components/OnboardingLayout";
import { OuraConnectModal } from "../../components/OuraConnectModal";

export default function TrackerScreen({
  next,
  back,
  currentStep,
  totalSteps,
}: {
  next: (tracker: string | null) => void;
  back: () => void;
  currentStep: number;
  totalSteps: number;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [showOuraModal, setShowOuraModal] = useState(false);

  const progress = (currentStep / totalSteps) * 100;

  const handleCardPress = (key: string) => {
    if (key === "Oura") {
      setShowOuraModal(true);
    } else {
      setSelected(selected === key ? null : key);
    }
  };

  const card = (key: string, title: string, subtitle?: string, disabled?: boolean) => {
    const isSelected = selected === key;
    return (
      <TouchableOpacity
        key={key}
        activeOpacity={0.85}
        onPress={() => !disabled && handleCardPress(key)}
        style={{
          backgroundColor: "#FFFFFF",
          borderRadius: 12,
          borderWidth: isSelected ? 1.5 : 0.5,
          borderColor: isSelected ? "#1A1A1A" : "rgba(0,0,0,0.08)",
          padding: 16,
          marginTop: 10,
        }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View>
            <Text style={{ fontSize: 15, fontWeight: "500", color: "#1A1A1A" }}>{title}</Text>
            {subtitle ? (
              <Text style={{ fontSize: 13, color: "#6B6B6B", marginTop: 6 }}>{subtitle}</Text>
            ) : null}
          </View>
          {disabled && (
            <View style={{ backgroundColor: "#FDF3E7", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100 }}>
              <Text style={{ color: "#8A4E1A", fontSize: 11 }}>coming soon</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <>
      <OnboardingLayout
        progress={progress}
        showBackArrow
        question="Do you track your health?"
        subtitle="We'll use this to personalize your alignment score."
        continueDisabled={!selected}
        onContinue={() => next(selected)}
        onBack={back}
      >
        <>
          {card("Oura", "Oura Ring")}
          {card("Apple", "Apple Watch", undefined, true)}
          {card("Whoop", "Whoop", undefined, true)}
          {card("Other", "Other tracker")}
          {card("None", "I don't track")}
        </>
      </OnboardingLayout>

      <OuraConnectModal
        visible={showOuraModal}
        onSuccess={() => {
          setShowOuraModal(false);
          setSelected("Oura");
          next("Oura");
        }}
        onDismiss={() => setShowOuraModal(false)}
      />
    </>
  );
}
