import React, { useEffect, useRef, useState } from "react";
import { Animated, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { doc, setDoc } from "firebase/firestore";
import { useAuth } from "../../auth/AuthContext";
import { db } from "../../firebase";
import { onboardingStyles as styles } from "../../theme/onboarding";

export default function TrackerScreen({ next, back, currentStep, totalSteps }: { next: () => void; back: () => void; currentStep: number; totalSteps: number }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [ouraToken, setOuraToken] = useState("");
  const { user } = useAuth() as any;
  const progress = useRef(new Animated.Value(0)).current;
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const toValue = Math.max(0, Math.min(1, currentStep / totalSteps));
    Animated.timing(progress, { toValue, duration: 300, useNativeDriver: false }).start();
  }, [currentStep, totalSteps]);

  const progressWidth = progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });

  const toggle = (key: string) => {
    const v = selected === key ? null : key;
    setSelected(v);
    Animated.timing(anim, { toValue: v === "Oura" ? 1 : 0, duration: 200, useNativeDriver: false }).start();
  };

  const handleContinue = async () => {
    if (user?.uid) {
      await setDoc(doc(db, "users", user.uid), { dataSource: selected, ouraToken: ouraToken || null }, { merge: true });
    }
    next();
  };

  const card = (key: string, title: string, subtitle?: string, disabled?: boolean) => {
    const isSelected = selected === key;
    return (
      <TouchableOpacity
        key={key}
        activeOpacity={0.85}
        onPress={() => !disabled && toggle(key)}
        style={[styles.card, { marginTop: 10, borderColor: isSelected ? "#1A1A1A" : "rgba(0,0,0,0.08)", borderWidth: isSelected ? 1.5 : 0.5 }]}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View>
            <Text style={styles.cardTitle}>{title}</Text>
            {subtitle ? <Text style={styles.cardSubtitle}>{subtitle}</Text> : null}
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

  const expandedHeight = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 72] });

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={back} style={styles.backButton}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <View style={styles.progressTrack}>
          <Animated.View style={{ height: 8, backgroundColor: "#1A1A1A", borderRadius: 4, width: progressWidth }} />
        </View>
      </View>

      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.heading}>Do you track your health?</Text>
          <Text style={styles.body}>We'll use this to personalize your alignment score.</Text>

          {card("Oura", "Oura Ring")}
          {card("Apple", "Apple Watch", undefined, true)}
          {card("Whoop", "Whoop", undefined, true)}
          {card("Other", "Other tracker")}
          {card("None", "I don't track")}

          <Animated.View style={{ overflow: "hidden", height: expandedHeight }}>
            <View style={{ marginTop: 12 }}>
              <Text style={{ fontSize: 13, color: "#6B6B6B", marginBottom: 6 }}>Paste your Oura personal access token</Text>
              <TextInput value={ouraToken} onChangeText={setOuraToken} style={[styles.input, { height: 44 }]} placeholder="Personal access token" />
              <TouchableOpacity onPress={() => { /* open link */ }}>
                <Text style={{ color: "#1A1A1A", marginTop: 8 }}>Where do I find this?</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.primaryBtn, !selected && styles.primaryBtnDisabled]}
            onPress={handleContinue}
            disabled={!selected}
          >
            <Text style={[styles.primaryBtnText, !selected && styles.primaryBtnTextDisabled]}>
              Continue
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}
