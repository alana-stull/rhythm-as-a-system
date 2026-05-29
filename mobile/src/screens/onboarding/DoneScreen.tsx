import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { usePressScale } from "../../hooks/usePressScale";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../auth/AuthContext";
import { fontFamily, colors } from "../../theme";

export default function DoneScreen() {
  const { userName, completeOnboarding } = useAuth() as any;
  const { scale, pressIn, pressOut } = usePressScale();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      {/* Content */}
      <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 64, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontFamily: fontFamily.heading, fontSize: 28, color: "#1A1A1A", textAlign: "center" }}>
          Hi {userName || "there"}!
        </Text>
        <Text style={{ fontSize: 18, fontStyle: "italic", color: "#6B6B6B", lineHeight: 26, marginTop: 12, textAlign: "center" }}>
          Your body and your schedule, finally working together.
        </Text>
      </View>

      {/* Bottom */}
      <View style={{ paddingHorizontal: 24, paddingBottom: 40, alignItems: "center" }}>
        <TouchableOpacity
          activeOpacity={1}
          onPressIn={pressIn}
          onPressOut={pressOut}
          style={{ width: "100%", height: 56, borderRadius: 12, backgroundColor: "#B8772A", alignItems: "center", justifyContent: "center", transform: [{ scale }] } as any}
          onPress={completeOnboarding}
        >
          <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "500" }}>Open Rhythm</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
