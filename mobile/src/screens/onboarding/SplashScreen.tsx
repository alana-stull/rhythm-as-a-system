import React, { useEffect, useRef } from "react";
import { Animated, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { onboardingStyles as styles } from "../../theme/onboarding";

export default function SplashScreen({ next }: { next: () => void }) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: true }).start();
    const t = setTimeout(() => next(), 1800);
    return () => clearTimeout(t);
  }, [next, opacity]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <Animated.View style={[{ alignItems: "center", marginTop: 80, opacity }]}> 
        <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: "#1A1A1A", alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: "#FFFFFF", fontFamily: "Tiempos-Semibold", fontSize: 22 }}>R</Text>
        </View>
        <Text style={[styles.heading, { fontSize: 32, marginTop: 16 }]}>Rhythm</Text>
      </Animated.View>
    </SafeAreaView>
  );
}
