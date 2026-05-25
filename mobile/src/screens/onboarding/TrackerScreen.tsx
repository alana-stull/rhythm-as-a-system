import React, { useRef, useState } from "react";
import { Animated, Text, TextInput, TouchableOpacity, View } from "react-native";
import { doc, setDoc } from "firebase/firestore";
import { useAuth } from "../../auth/AuthContext";
import { db } from "../../firebase";
import { OnboardingLayout } from "../../components/OnboardingLayout";

export default function TrackerScreen({
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
  const [ouraToken, setOuraToken] = useState("");
  const { user } = useAuth() as any;
  const anim = useRef(new Animated.Value(0)).current;

  const toggle = (key: string) => {
    const v = selected === key ? null : key;
    setSelected(v);
    Animated.timing(anim, {
      toValue: v === "Oura" ? 1 : 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  };

  const handleContinue = async () => {
    if (user?.uid) {
      await setDoc(
        doc(db, "users", user.uid),
        { dataSource: selected, ouraToken: ouraToken || null },
        { merge: true }
      );
    }
    next();
  };

  const expandedHeight = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 72] });
  const progress = (currentStep / totalSteps) * 100;

  const card = (key: string, title: string, subtitle?: string, disabled?: boolean) => {
    const isSelected = selected === key;
    return (
      <TouchableOpacity
        key={key}
        activeOpacity={0.85}
        onPress={() => !disabled && toggle(key)}
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
    <OnboardingLayout
      progress={progress}
      showBackArrow
      question="Do you track your health?"
      subtitle="We'll use this to personalize your alignment score."
      continueDisabled={!selected}
      onContinue={handleContinue}
      onBack={back}
    >
      <>
        {card("Oura", "Oura Ring")}
        {card("Apple", "Apple Watch", undefined, true)}
        {card("Whoop", "Whoop", undefined, true)}
        {card("Other", "Other tracker")}
        {card("None", "I don't track")}

        <Animated.View style={{ overflow: "hidden", height: expandedHeight }}>
          <View style={{ marginTop: 12 }}>
            <Text style={{ fontSize: 13, color: "#6B6B6B", marginBottom: 6 }}>
              Paste your Oura personal access token
            </Text>
            <TextInput
              value={ouraToken}
              onChangeText={setOuraToken}
              style={{
                width: "100%",
                height: 44,
                backgroundColor: "#FFFFFF",
                borderRadius: 12,
                paddingHorizontal: 16,
                borderWidth: 0.5,
                borderColor: "rgba(0,0,0,0.1)",
                fontSize: 16,
              }}
              placeholder="Personal access token"
            />
            <TouchableOpacity onPress={() => {}}>
              <Text style={{ color: "#1A1A1A", marginTop: 8 }}>Where do I find this?</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </>
    </OnboardingLayout>
  );
}
