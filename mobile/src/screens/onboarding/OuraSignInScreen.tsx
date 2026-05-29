import React, { useEffect, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import * as SecureStore from "expo-secure-store";
import { doc, setDoc } from "firebase/firestore";
import { useAuth } from "../../auth/AuthContext";
import { db } from "../../firebase";
import { OnboardingLayout } from "../../components/OnboardingLayout";

WebBrowser.maybeCompleteAuthSession();

const OURA_CLIENT_ID = process.env.EXPO_PUBLIC_OURA_CLIENT_ID ?? "";

const discovery = {
  authorizationEndpoint: "https://cloud.ouraring.com/oauth/authorize",
  tokenEndpoint: "https://api.ouraring.com/oauth/token",
};

export default function OuraSignInScreen({
  next,
  back,
  currentStep,
  totalSteps,
}: {
  next: () => void;
  back: () => void;
  currentStep: number;
  totalSteps: number;
}) {
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const { user } = useAuth() as any;

  const redirectUri = AuthSession.makeRedirectUri();
  console.log("Oura redirect URI:", redirectUri);

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: OURA_CLIENT_ID,
      scopes: ["personal", "daily"],
      redirectUri,
      usePKCE: true,
    },
    discovery
  );

  useEffect(() => {
    if (response?.type === "success") {
      const { code } = response.params;
      exchangeCode(code);
    } else if (response?.type === "error") {
      setError("Something went wrong. Please try again.");
    }
  }, [response]);

  const exchangeCode = async (code: string) => {
    setSyncing(true);
    try {
      const tokenResponse = await AuthSession.exchangeCodeAsync(
        {
          clientId: OURA_CLIENT_ID,
          code,
          redirectUri,
          extraParams: { code_verifier: request!.codeVerifier! },
        },
        discovery
      );

      await SecureStore.setItemAsync("oura_access_token", tokenResponse.accessToken);
      if (tokenResponse.refreshToken) {
        await SecureStore.setItemAsync("oura_refresh_token", tokenResponse.refreshToken);
      }

      if (user?.uid) {
        await setDoc(
          doc(db, "users", user.uid),
          { dataSource: "Oura", ouraConnected: true },
          { merge: true }
        );
      }

      next();
    } catch {
      setSyncing(false);
      setError("Something went wrong. Please try again.");
    }
  };

  const progress = (currentStep / totalSteps) * 100;

  return (
    <OnboardingLayout
      progress={progress}
      showBackArrow
      question="Connect your Oura Ring"
      subtitle="We'll sync your sleep and recovery data"
      onBack={back}
    >
      <View style={{ gap: 16 }}>
        {syncing ? (
          <View style={{ alignItems: "center", paddingVertical: 24, gap: 12 }}>
            <ActivityIndicator color="#1A1A1A" />
            <Text style={{ fontSize: 14, color: "#6B6B6B" }}>Syncing your data…</Text>
          </View>
        ) : (
          <>
            <TouchableOpacity
              style={{
                backgroundColor: "#1A1A1A",
                borderRadius: 14,
                paddingVertical: 16,
                alignItems: "center",
                opacity: request ? 1 : 0.4,
              }}
              disabled={!request}
              onPress={() => {
                setError(null);
                promptAsync();
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: "600", color: "#FFFFFF" }}>
                Sign in with Oura
              </Text>
            </TouchableOpacity>

            {error && (
              <Text style={{ fontSize: 13, color: "#C0392B", textAlign: "center" }}>
                {error}
              </Text>
            )}

            <TouchableOpacity onPress={next}>
              <Text style={{ fontSize: 14, color: "#9B9B9B", textAlign: "center" }}>
                Skip for now
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </OnboardingLayout>
  );
}
