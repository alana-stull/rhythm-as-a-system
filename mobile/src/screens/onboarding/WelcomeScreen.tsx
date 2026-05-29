import React from "react";
import { Image, Text, TouchableOpacity, View } from "react-native";
import { usePressScale } from "../../hooks/usePressScale";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../auth/AuthContext";
import { fontFamily, colors } from "../../theme";
// @ts-ignore — RN image import
import logo from "../../components/logo.png";

export default function WelcomeScreen({ next }: { next: () => void }) {
  const { signInWithGoogle } = useAuth() as any;
  const { scale: phoneScale, pressIn: phonePressIn, pressOut: phonePressOut } = usePressScale();
  const { scale: googleScale, pressIn: googlePressIn, pressOut: googlePressOut } = usePressScale();
  const { scale: signInScale, pressIn: signInPressIn, pressOut: signInPressOut } = usePressScale(0.98);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      {/* Upper half — centered */}
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 }}>
        <Image source={logo} style={{ width: 56, height: 56 }} resizeMode="contain" />
        <Text style={{ fontFamily: fontFamily.heading, fontSize: 34, color: "#B8772A", marginTop: 10 }}>
          rhythm
        </Text>
        <Text style={{ fontSize: 17, fontStyle: "italic", color: "#6B6B6B", marginTop: 10, lineHeight: 22, textAlign: "center" }}>
          Make every day manageable, not perfect.
        </Text>
      </View>

      {/* Bottom section — pinned */}
      <View style={{ paddingHorizontal: 24, paddingBottom: 40, gap: 12 }}>
        <TouchableOpacity
          activeOpacity={1}
          onPressIn={phonePressIn}
          onPressOut={phonePressOut}
          style={{ height: 56, borderRadius: 12, backgroundColor: "#1A1A1A", alignItems: "center", justifyContent: "center", transform: [{ scale: phoneScale }] } as any}
          onPress={next}
        >
          <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "500" }}>Use phone number</Text>
        </TouchableOpacity>

        {/* Divider */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ flex: 1, height: 0.5, backgroundColor: "rgba(0,0,0,0.12)" }} />
          <Text style={{ fontSize: 13, color: "#ABABAB" }}>or</Text>
          <View style={{ flex: 1, height: 0.5, backgroundColor: "rgba(0,0,0,0.12)" }} />
        </View>

        <TouchableOpacity
          activeOpacity={1}
          onPressIn={googlePressIn}
          onPressOut={googlePressOut}
          style={{ height: 56, borderRadius: 12, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", borderWidth: 0.5, borderColor: "rgba(0,0,0,0.12)", transform: [{ scale: googleScale }] } as any}
          onPress={() => signInWithGoogle().catch(() => {})}
        >
          <Text style={{ color: "#1A1A1A", fontSize: 16, fontWeight: "500" }}>Continue with Google</Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={1}
          onPressIn={signInPressIn}
          onPressOut={signInPressOut}
          onPress={next}
          style={{ alignItems: "center", paddingTop: 4, transform: [{ scale: signInScale }] } as any}
        >
          <Text style={{ fontSize: 14, color: "#6B6B6B" }}>
            Already have an account?{" "}
            <Text style={{ color: "#1A1A1A", fontWeight: "500" }}>Sign in</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
