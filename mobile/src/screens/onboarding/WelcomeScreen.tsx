import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../auth/AuthContext";
import { onboardingStyles as styles } from "../../theme/onboarding";

export default function WelcomeScreen({ next }: { next: () => void }) {
  const { signInWithGoogle } = useAuth();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.heading}>Your body already knows.</Text>
          <Text style={styles.body}>Rhythm helps you listen.</Text>
        </View>

        <View style={styles.footer}>
          <TouchableOpacity style={styles.primaryBtn} onPress={next}>
            <Text style={styles.primaryBtnText}>Use phone number</Text>
          </TouchableOpacity>

          <View style={{ height: 12 }} />

          <TouchableOpacity style={styles.secondaryBtn} onPress={() => signInWithGoogle().catch(() => {})}>
            <Text style={styles.secondaryBtnText}>Continue with Google</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}
