import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  TouchableOpacity,
  Keyboard,
  TouchableWithoutFeedback,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, fontFamily, space, radius } from "../theme";
import { usePressScale } from "../hooks/usePressScale";

interface OnboardingLayoutProps {
  children: React.ReactNode;
  progress: number;
  showBackArrow?: boolean;
  question?: string;
  subtitle?: string;
  continueDisabled?: boolean;
  onContinue?: () => void;
  onBack?: () => void;
}

let _lastProgress = 0;

export function OnboardingLayout({
  children,
  progress,
  showBackArrow = true,
  question,
  subtitle,
  continueDisabled = false,
  onContinue,
  onBack,
}: OnboardingLayoutProps) {
  const animatedProgress = useRef(new Animated.Value(_lastProgress)).current;
  const { scale: continueScale, pressIn: continuePressIn, pressOut: continuePressOut } = usePressScale();
  const { scale: backScale, pressIn: backPressIn, pressOut: backPressOut } = usePressScale(0.9);

  useEffect(() => {
    Animated.timing(animatedProgress, {
      toValue: progress,
      duration: 500,
      useNativeDriver: false,
    }).start();
    _lastProgress = progress;
  }, [progress]);

  const animatedWidth = animatedProgress.interpolate({
    inputRange: [0, 100],
    outputRange: ["0%", "100%"],
  });

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={styles.root}>
        <SafeAreaView style={styles.safeArea} edges={["top"]}>
          {/* Top row: back arrow + progress bar */}
          <View style={styles.topRow}>
            {showBackArrow ? (
              <TouchableOpacity
                style={[styles.backBtn, { transform: [{ scale: backScale }] }] as any}
                activeOpacity={1}
                onPressIn={backPressIn}
                onPressOut={backPressOut}
                onPress={onBack}
              >
                <Text style={styles.backArrow}>←</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.backBtn} />
            )}

            {/* Progress bar */}
            <View style={styles.progressBarContainer}>
              <View style={styles.progressBarBackground}>
                <Animated.View
                  style={[styles.progressBarFilled, { width: animatedWidth }]}
                />
              </View>
            </View>
          </View>

          {/* Content area */}
          <View style={styles.contentContainer}>
            {question ? (
              <Text style={styles.question}>{question}</Text>
            ) : null}
            {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
            {children}
          </View>

          {/* Continue button */}
          {onContinue && (
            <TouchableOpacity
              style={[
                styles.continueBtn,
                continueDisabled ? styles.continueBtnDisabled : styles.continueBtnActive,
                { transform: [{ scale: continueScale }] },
              ] as any}
              activeOpacity={1}
              onPressIn={continuePressIn}
              onPressOut={continuePressOut}
              onPress={onContinue}
              disabled={continueDisabled}
            >
              <Text
                style={[
                  styles.continueBtnText,
                  continueDisabled ? styles.continueBtnTextDisabled : styles.continueBtnTextActive,
                ]}
              >
                Continue
              </Text>
            </TouchableOpacity>
          )}
        </SafeAreaView>
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  safeArea: {
    flex: 1,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 12,
    gap: 14,
  },
  backBtn: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  backArrow: {
    fontSize: 20,
    color: colors.text.secondary,
  },
  progressBarContainer: {
    flex: 1,
  },
  progressBarBackground: {
    height: 7,
    borderRadius: 7,
    backgroundColor: "#E3E4E6",
    overflow: "hidden",
  },
  progressBarFilled: {
    height: "100%",
    borderRadius: 7,
    backgroundColor: "#C27E3A",
    overflow: "hidden",
  },
  contentContainer: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 32,
  },
  question: {
    fontFamily: fontFamily.heading,
    fontSize: 24,
    fontWeight: "600",
    color: colors.text.primary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: colors.text.secondary,
    lineHeight: 22,
    marginBottom: 28,
  },
  continueBtn: {
    position: "absolute",
    bottom: 36,
    left: 24,
    right: 24,
    height: 52,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  continueBtnActive: {
    backgroundColor: "#C27E3A",
  },
  continueBtnDisabled: {
    backgroundColor: "#E3E4E6",
  },
  continueBtnText: {
    fontSize: 15,
    fontWeight: "500",
  },
  continueBtnTextActive: {
    color: "white",
  },
  continueBtnTextDisabled: {
    color: "#A0A4A8",
  },
});
