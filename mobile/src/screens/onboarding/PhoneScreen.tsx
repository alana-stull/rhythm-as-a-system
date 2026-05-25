import React, { useEffect, useRef, useState } from "react";
import { Animated, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../auth/AuthContext";
import { onboardingStyles as styles } from "../../theme/onboarding";

export default function PhoneScreen({ next, back, currentStep, totalSteps }: { next: () => void; back: () => void; currentStep: number; totalSteps: number }) {
  const { signInWithPhone, confirmOTP } = useAuth();
  const [phone, setPhone] = useState("");
  const [sent, setSent] = useState(false);
  const [otp, setOtp] = useState<string[]>(["", "", "", "", "", ""]);
  const inputs = useRef<Array<TextInput | null>>([]);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const toValue = Math.max(0, Math.min(1, currentStep / totalSteps));
    Animated.timing(progress, { toValue, duration: 300, useNativeDriver: false }).start();
  }, [currentStep, totalSteps]);

  const progressWidth = progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });

  const handleSend = async () => {
    try {
      await signInWithPhone(phone);
      setSent(true);
    } catch {
      setSent(true);
    }
  };

  useEffect(() => {
    if (otp.every((c) => c.length === 1)) {
      const code = otp.join("");
      confirmOTP(code).then(() => next()).catch(() => next());
    }
  }, [otp]);

  const updateOtp = (i: number, val: string) => {
    const v = val.replace(/[^0-9]/g, "");
    const nextOtp = [...otp];
    nextOtp[i] = v.slice(-1);
    setOtp(nextOtp);
    if (v && inputs.current[i + 1]) inputs.current[i + 1]?.focus();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header with back arrow and progress bar */}
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
          <Text style={styles.heading}>{sent ? "Check your texts." : "What's your number?"}</Text>
          <Text style={styles.body}>
            {sent ? `We sent a code to ${phone}` : "We protect our community by ensuring everyone on Rhythm is real."}
          </Text>

          {!sent ? (
            <View style={styles.inputRow}>
              <TouchableOpacity style={styles.countryCodeButton}>
                <Text style={styles.countryCodeFlag}>🇺🇸</Text>
                <Text style={styles.countryCodeText}>+1</Text>
              </TouchableOpacity>
              <TextInput
                style={styles.phoneInput}
                keyboardType="phone-pad"
                placeholder="(555) 123-4567"
                value={phone}
                onChangeText={setPhone}
                placeholderTextColor="#C0C0C0"
              />
            </View>
          ) : (
            <>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 20, justifyContent: "center" }}>
                {otp.map((val, i) => (
                  <TextInput
                    key={i}
                    ref={(r) => { inputs.current[i] = r; }}
                    style={{
                      width: 44,
                      height: 56,
                      backgroundColor: "#FFFFFF",
                      borderRadius: 12,
                      borderWidth: 0.5,
                      borderColor: "rgba(0,0,0,0.1)",
                      textAlign: "center",
                      fontSize: 20,
                      fontWeight: "600",
                    }}
                    keyboardType="number-pad"
                    maxLength={1}
                    value={val}
                    onChangeText={(t) => updateOtp(i, t)}
                  />
                ))}
              </View>
              <TouchableOpacity onPress={() => { setOtp(["", "", "", "", "", ""]); }}>
                <Text style={{ color: "#6B6B6B", marginTop: 16, textAlign: "center", fontSize: 14 }}>Resend code</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.primaryBtn, !phone && !sent && styles.primaryBtnDisabled]}
            onPress={handleSend}
            disabled={!phone && !sent}
          >
            <Text style={[styles.primaryBtnText, !phone && !sent && styles.primaryBtnTextDisabled]}>
              {sent ? "Continue" : "Send code"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}
