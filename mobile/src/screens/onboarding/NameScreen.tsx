import React, { useEffect, useRef, useState } from "react";
import { Animated, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { doc, setDoc } from "firebase/firestore";
import { useAuth } from "../../auth/AuthContext";
import { db } from "../../firebase";
import { onboardingStyles as styles } from "../../theme/onboarding";

export default function NameScreen({ next, back, currentStep, totalSteps }: { next: () => void; back: () => void; currentStep: number; totalSteps: number }) {
  const [name, setName] = useState("");
  const { user } = useAuth() as any;
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const toValue = Math.max(0, Math.min(1, currentStep / totalSteps));
    Animated.timing(progress, { toValue, duration: 300, useNativeDriver: false }).start();
  }, [currentStep, totalSteps]);

  const progressWidth = progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });

  const handleContinue = async () => {
    if (user?.uid) {
      await setDoc(doc(db, "users", user.uid), { name }, { merge: true });
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
          <Text style={styles.heading}>What should we call you?</Text>
          <TextInput
            style={styles.input}
            placeholder="First name"
            autoFocus
            value={name}
            onChangeText={setName}
            placeholderTextColor="#C0C0C0"
          />
        </View>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.primaryBtn, !name && styles.primaryBtnDisabled]}
            onPress={handleContinue}
            disabled={!name}
          >
            <Text style={[styles.primaryBtnText, !name && styles.primaryBtnTextDisabled]}>
              Continue
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}
