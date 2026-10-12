// Per-weight imports: the package roots would bundle every weight (34 files).
import { DMSans_400Regular } from "@expo-google-fonts/dm-sans/400Regular";
import { DMSans_500Medium } from "@expo-google-fonts/dm-sans/500Medium";
import { DMSans_600SemiBold } from "@expo-google-fonts/dm-sans/600SemiBold";
import { DMSans_700Bold } from "@expo-google-fonts/dm-sans/700Bold";
import { SourceSerif4_500Medium } from "@expo-google-fonts/source-serif-4/500Medium";
import { SourceSerif4_600SemiBold } from "@expo-google-fonts/source-serif-4/600SemiBold";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider, useSession } from "../src/auth/SessionProvider";
import { Button, color, space, Text } from "../src/design";

SplashScreen.preventAutoHideAsync().catch(() => {});

// Access is gated: signed out → sign-in only; signed in but not onboarded →
// onboarding only; otherwise the app. There is no guest or preview mode.
function Gate() {
  const { status, profile, profileError, refreshProfile, signOut } = useSession();
  const resolving = status === "loading" || (status === "signedIn" && !profile && !profileError);

  useEffect(() => {
    if (!resolving) SplashScreen.hideAsync().catch(() => {});
  }, [resolving]);

  if (resolving) return null;

  if (status === "signedIn" && !profile) {
    return (
      <View style={{ flex: 1, backgroundColor: color.cream, justifyContent: "center", padding: space.lg, gap: space.sm }}>
        <Text variant="title" accessibilityRole="header">Can't reach Rhythm</Text>
        <Text color={color.muted}>{profileError}</Text>
        <Button label="Try again" onPress={refreshProfile} style={{ marginTop: space.md }} />
        <Button label="Sign out" variant="ghost" onPress={signOut} style={{ alignSelf: "center" }} />
      </View>
    );
  }

  const signedOut = status === "signedOut";
  const onboarded = !!profile?.onboarding_completed;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.cream } }}>
      <Stack.Protected guard={signedOut}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
      <Stack.Protected guard={!signedOut && !onboarded}>
        <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
      </Stack.Protected>
      <Stack.Protected guard={!signedOut && onboarded}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="design" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  // Keys must match `fontFamily` in src/design/typography.ts.
  const [loaded, error] = useFonts({
    SourceSerif4_500Medium,
    SourceSerif4_600SemiBold,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
  });
  if (!loaded && !error) return null;

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SessionProvider>
        <Gate />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
