import React, { useEffect, useRef, useState } from "react";
import { Animated, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { doc, setDoc } from "firebase/firestore";
import { useAuth } from "../../auth/AuthContext";
import { db } from "../../firebase";
import { onboardingStyles as styles } from "../../theme/onboarding";

const OPTIONS = [
  { key: "gentle", title: "Gentle", subtitle: "Soft nudges, no pressure" },
  { key: "direct", title: "Direct", subtitle: "Clear and to the point" },
  { key: "motivating", title: "Motivating", subtitle: "Push me a little" },
];

export default function ToneScreen({ next, back, currentStep, totalSteps }: { next: () => void; back: () => void; currentStep: number; totalSteps: number }) {
  const [selected, setSelected] = useState<string | null>(null);
  const { user } = useAuth() as any;
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const toValue = Math.max(0, Math.min(1, currentStep / totalSteps));
    Animated.timing(progress, { toValue, duration: 300, useNativeDriver: false }).start();
  }, [currentStep, totalSteps]);

  const progressWidth = progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });

  const handleContinue = async () => {
    if (user?.uid) {
      await setDoc(doc(db, "users", user.uid), { promptTone: selected }, { merge: true });
    }
    next();
  };

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
          <Text style={styles.heading}>How should Rhythm talk to you?</Text>
          <Text style={styles.body}>You can change this anytime in settings.</Text>

          {OPTIONS.map((o) => (
            <TouchableOpacity
              key={o.key}
              onPress={() => setSelected(o.key)}
              style={[styles.card, { marginTop: 10, borderColor: selected === o.key ? "#1A1A1A" : "rgba(0,0,0,0.08)", borderWidth: selected === o.key ? 1.5 : 0.5 }]}
            >
              <Text style={{ fontSize: 15, fontWeight: "500", color: "#1A1A1A" }}>{o.title}</Text>
              <Text style={{ fontSize: 13, color: "#6B6B6B", marginTop: 2 }}>{o.subtitle}</Text>
            </TouchableOpacity>
          ))}
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
