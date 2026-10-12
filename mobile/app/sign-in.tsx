import React, { useState } from "react";
import * as AppleAuthentication from "expo-apple-authentication";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { Image, KeyboardAvoidingView, Platform, Pressable, Text as RNText, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSession } from "../src/auth/SessionProvider";
import { Button, color, fontFamily, Icon, minTouch, radius, space, Text, TextField } from "../src/design";
import { supabaseConfigured } from "../src/lib/supabase";

type Step = "welcome" | "email" | "code";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Apple's own button in real builds (required artwork and wording). Expo Go
// lacks that native view, so development review gets a same-size stand-in.
const IN_EXPO_GO = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

function AppleButton({ onPress }: { onPress: () => void }) {
  if (!IN_EXPO_GO) {
    return (
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
        buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
        cornerRadius={radius.button}
        style={styles.authButton}
        onPress={onPress}
      />
    );
  }
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Continue with Apple"
               style={({ pressed }) => [styles.authButton, styles.appleStandIn, pressed && { opacity: 0.8 }]}>
      <RNText style={styles.appleGlyph} allowFontScaling={false}>{"\uF8FF"}</RNText>
      <RNText style={styles.appleLabel} maxFontSizeMultiplier={1.3}>Continue with Apple</RNText>
    </Pressable>
  );
}

// Welcome → email → 6-digit code. The only way into Rhythm.
export default function SignIn() {
  const { sendCode, verifyCode } = useSession();
  const [step, setStep] = useState<Step>("welcome");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const send = () => run(async () => {
    await sendCode(email.trim().toLowerCase());
    setCode("");
    setStep("code");
  });
  const verify = () => run(() => verifyCode(email.trim().toLowerCase(), code));

  if (step === "welcome") {
    return (
      <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
        <View style={styles.hero}>
          <View style={styles.brand} accessible accessibilityRole="header" accessibilityLabel="Rhythm. Your systems, in sync.">
            <Image source={require("../src/components/logo.png")} style={styles.mark} resizeMode="cover" />
            <Text style={styles.wordmark} maxFontSizeMultiplier={1.3}>rhythm</Text>
            <Text variant="meta" color={color.muted} style={styles.tagline}>your systems, in sync.</Text>
          </View>
        </View>
        <View style={styles.actions}>
          <Text variant="question" accessibilityRole="header" style={[styles.center, styles.headline]}>
            Make room for what matters.
          </Text>
          {Platform.OS === "ios" && (
            <AppleButton onPress={() => setError("Sign in with Apple isn't set up yet. Continue with email for now.")} />
          )}
          <Button label="Continue with email" variant="neutral" fullWidth style={styles.authButton}
                  onPress={() => { setError(null); setStep("email"); }} disabled={!supabaseConfigured} />
          {error && <Text variant="meta" color={color.muted} style={styles.center} accessibilityLiveRegion="polite">{error}</Text>}
          {!supabaseConfigured && (
            <Text variant="meta" color={color.muted} style={styles.center}>
              Sign-in isn't configured in this build (EXPO_PUBLIC_SUPABASE_URL).
            </Text>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const isEmail = step === "email";
  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.top}>
          <Pressable
            onPress={() => { setError(null); setStep(isEmail ? "welcome" : "email"); }}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={styles.back}
          >
            <Icon name="chevronLeft" size={18} color={color.muted} strokeWidth={2.2} />
          </Pressable>
        </View>
        <View style={styles.body}>
          <Text variant="title" accessibilityRole="header">
            {isEmail ? "What's your email?" : "Check your email"}
          </Text>
          <Text color={color.muted}>
            {isEmail ? "We'll send you a 6-digit code. No password needed." : `Enter the 6-digit code sent to ${email.trim()}.`}
          </Text>
          {isEmail ? (
            <TextField
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              autoFocus
              returnKeyType="send"
              onSubmitEditing={() => EMAIL.test(email.trim()) && send()}
              accessibilityLabel="Email address"
            />
          ) : (
            <TextField
              value={code}
              onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
              placeholder="123456"
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              autoFocus
              maxLength={6}
              accessibilityLabel="6-digit code"
              style={{ letterSpacing: 6, fontSize: 22 }}
            />
          )}
          {error && <Text variant="meta" color="#6B2F2A" accessibilityLiveRegion="polite">{error}</Text>}
        </View>
        <View style={styles.footer}>
          {isEmail ? (
            <Button label={busy ? "Sending…" : "Send code"} fullWidth disabled={busy || !EMAIL.test(email.trim())} onPress={send} />
          ) : (
            <>
              <Button label={busy ? "Checking…" : "Continue"} fullWidth disabled={busy || code.length !== 6} onPress={verify} />
              <Button label="Send a new code" variant="ghost" onPress={send} disabled={busy}
                      style={{ alignSelf: "center", marginTop: space.sm }} />
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.cream },
  // Welcome: brand in the upper middle, headline + actions on the safe-area floor.
  hero: { flex: 1, paddingHorizontal: space.lg, justifyContent: "center", paddingBottom: space.xxl },
  brand: { alignItems: "center" },
  mark: { width: 80, height: 80, borderRadius: 18, marginBottom: space.md },  // the logo file's own soft neutral ground
  wordmark: { fontFamily: fontFamily.serif, fontSize: 34, lineHeight: 40, letterSpacing: -0.5, color: color.ink },
  tagline: { marginTop: 6, fontSize: 15, lineHeight: 20, letterSpacing: 0.3 },
  headline: { fontSize: 18, lineHeight: 24, marginBottom: space.xs },
  center: { textAlign: "center" },
  actions: { paddingHorizontal: space.lg, paddingBottom: space.md, gap: space.sm },
  authButton: { height: 52, width: "100%" },
  appleStandIn: { backgroundColor: "#000", borderRadius: radius.button, flexDirection: "row", alignItems: "center",
                  justifyContent: "center", gap: 6 },
  appleGlyph: { color: "#fff", fontSize: 19, marginTop: -3 },
  appleLabel: { color: "#fff", fontSize: 17, fontWeight: "600" },
  top: { paddingHorizontal: space.gutter, paddingTop: space.xs },
  back: { width: minTouch, height: minTouch, justifyContent: "center", marginLeft: -12, paddingLeft: 12 },
  body: { flex: 1, paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.sm },
  footer: { paddingHorizontal: space.lg, paddingBottom: space.md },
});
