import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSession } from "../src/auth/SessionProvider";
import { Button, color, Icon, minTouch, space, Text, TextField } from "../src/design";
import { supabaseConfigured } from "../src/lib/supabase";

type Step = "welcome" | "email" | "code";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
      <SafeAreaView style={styles.root}>
        <View style={styles.welcome}>
          <Text variant="section" style={{ marginBottom: 6 }}>Rhythm</Text>
          <Text variant="display" accessibilityRole="header" style={{ marginBottom: 14 }}>
            What you have to give, alongside what life asks of you.
          </Text>
          <Text style={{ marginBottom: space.lg }}>
            Rhythm helps you see your capacity and your commitments together, so you can make more intentional decisions
            about your day — not just a longer to-do list.
          </Text>
          <Button label="Continue with email" onPress={() => setStep("email")} disabled={!supabaseConfigured} />
          {!supabaseConfigured && (
            <Text variant="meta" color={color.muted} style={{ marginTop: space.sm }}>
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
  welcome: { flex: 1, justifyContent: "center", paddingHorizontal: space.lg },
  top: { paddingHorizontal: space.gutter, paddingTop: space.xs },
  back: { width: minTouch, height: minTouch, justifyContent: "center", marginLeft: -12, paddingLeft: 12 },
  body: { flex: 1, paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.sm },
  footer: { paddingHorizontal: space.lg, paddingBottom: space.md },
});
