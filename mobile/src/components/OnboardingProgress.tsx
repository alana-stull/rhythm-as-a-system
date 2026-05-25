import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";

export function OnboardingProgress({ currentStep, totalSteps }: { currentStep: number; totalSteps: number }) {
  if (currentStep < 1) return null;

  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const toValue = Math.max(0, Math.min(1, currentStep / totalSteps));
    Animated.timing(progress, { toValue, duration: 300, useNativeDriver: false }).start();
  }, [currentStep, totalSteps, progress]);

  const width = progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });

  return (
    <View style={styles.track}>
      <Animated.View style={[styles.fill, { width }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 3, width: "100%", backgroundColor: "rgba(0,0,0,0.08)" },
  fill: { height: 3, backgroundColor: "#1A1A1A" },
});

export default OnboardingProgress;