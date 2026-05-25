import React, { useEffect, useRef, useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import { useAuth } from "../../auth/AuthContext";
import { OnboardingLayout } from "../../components/OnboardingLayout";

export default function PhoneScreen({
  next,
  back,
  currentStep,
  totalSteps
}: {
  next: () => void;
  back: () => void;
  currentStep: number;
  totalSteps: number;
}) {
  const { signInWithPhone, confirmOTP } = useAuth();
  const [phone, setPhone] = useState("");
  const [sent, setSent] = useState(false);
  const [otp, setOtp] = useState<string[]>(["", "", "", "", "", ""]);
  const inputs = useRef<Array<TextInput | null>>([]);

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

  const progress = (currentStep / totalSteps) * 100;

  return (
    <OnboardingLayout
      progress={progress}
      showBackArrow
      question={sent ? "Check your texts." : "What's your number?"}
      subtitle={
        sent
          ? `We sent a code to ${phone}`
          : "We protect our community by ensuring everyone on Rhythm is real."
      }
      continueDisabled={!phone && !sent}
      onContinue={sent ? next : handleSend}
      onBack={back}
    >
      {!sent ? (
        <View style={{ flexDirection: "row", gap: 12 }}>
          <TouchableOpacity
            style={{
              width: 72,
              height: 56,
              borderRadius: 12,
              backgroundColor: "#FFFFFF",
              borderWidth: 0.5,
              borderColor: "rgba(0,0,0,0.1)",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              flexDirection: "row",
            }}
          >
            <Text style={{ fontSize: 16 }}>🇺🇸</Text>
            <Text style={{ fontSize: 18, fontWeight: "500", color: "#1A1A1A" }}>
              +1
            </Text>
          </TouchableOpacity>
          <TextInput
            style={{
              flex: 1,
              height: 56,
              backgroundColor: "#FFFFFF",
              borderRadius: 12,
              paddingHorizontal: 16,
              borderWidth: 0.5,
              borderColor: "rgba(0,0,0,0.1)",
              fontSize: 16,
            }}
            keyboardType="phone-pad"
            placeholder="(555) 123-4567"
            value={phone}
            onChangeText={setPhone}
            placeholderTextColor="#C0C0C0"
          />
        </View>
      ) : (
        <>
          <View style={{ flexDirection: "row", gap: 8, justifyContent: "center" }}>
            {otp.map((val, i) => (
              <TextInput
                key={i}
                ref={(r) => {
                  inputs.current[i] = r;
                }}
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
          <TouchableOpacity onPress={() => setOtp(["", "", "", "", "", ""])}>
            <Text
              style={{
                color: "#6B6B6B",
                marginTop: 16,
                textAlign: "center",
                fontSize: 14,
              }}
            >
              Resend code
            </Text>
          </TouchableOpacity>
        </>
      )}
    </OnboardingLayout>
  );
}
