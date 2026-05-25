import React, { useEffect, useRef } from "react";
import { Animated, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { doc, setDoc } from "firebase/firestore";
import { useAuth } from "../../auth/AuthContext";
import { db } from "../../firebase";
import { onboardingStyles as styles } from "../../theme/onboarding";

export default function DoneScreen() {
  const { user, userName } = useAuth() as any;
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, { toValue: 1, duration: 300, useNativeDriver: false }).start();
  }, []);

  const progressWidth = progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });

  const handleFinish = async () => {
    if (user?.uid) {
      await setDoc(doc(db, "users", user.uid), { onboardingComplete: true }, { merge: true });
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View style={{ width: 40 }} />
        <View style={styles.progressTrack}>
          <Animated.View style={{ height: 8, backgroundColor: "#1A1A1A", borderRadius: 4, width: progressWidth }} />
        </View>
      </View>

      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.heading}>Hi {userName || "there"}.</Text>
          <Text style={styles.body}>Let's find your rhythm.</Text>
        </View>

        <View style={styles.footer}>
          <TouchableOpacity style={styles.primaryBtn} onPress={handleFinish}>
            <Text style={styles.primaryBtnText}>Open Rhythm</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}
