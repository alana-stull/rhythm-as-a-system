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
import { SafeAreaProvider } from "react-native-safe-area-context";
import { color } from "../src/design";

SplashScreen.preventAutoHideAsync().catch(() => {});

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

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync().catch(() => {});
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.cream } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="design" />
        <Stack.Screen name="onboarding" options={{ presentation: "fullScreenModal", gestureEnabled: false }} />
      </Stack>
    </SafeAreaProvider>
  );
}
