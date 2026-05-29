import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { usePressScale } from "../hooks/usePressScale";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import * as SecureStore from "expo-secure-store";
import { doc, setDoc } from "firebase/firestore";
import { useAuth } from "../auth/AuthContext";
import { db } from "../firebase";

WebBrowser.maybeCompleteAuthSession();

const OURA_CLIENT_ID = process.env.EXPO_PUBLIC_OURA_CLIENT_ID ?? "";

const discovery = {
  authorizationEndpoint: "https://cloud.ouraring.com/oauth/authorize",
  tokenEndpoint: "https://api.ouraring.com/oauth/token",
};

export function OuraConnectModal({
  visible,
  onSuccess,
  onDismiss,
}: {
  visible: boolean;
  onSuccess: () => void;
  onDismiss: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const { user } = useAuth() as any;
  const { scale: signInScale, pressIn: signInPressIn, pressOut: signInPressOut } = usePressScale();
  const { scale: skipScale, pressIn: skipPressIn, pressOut: skipPressOut } = usePressScale(0.98);

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
    if (!visible) {
      setError(null);
      setSyncing(false);
    }
  }, [visible]);

  useEffect(() => {
    if (response?.type === "success") {
      exchangeCode(response.params.code);
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

      onSuccess();
    } catch {
      setSyncing(false);
      setError("Something went wrong. Please try again.");
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      {/* Backdrop */}
      <Pressable
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)" }}
        onPress={onDismiss}
      />

      {/* Sheet */}
      <View
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: "#FFFFFF",
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          padding: 28,
          paddingBottom: 48,
          gap: 20,
        }}
      >
        {/* Handle */}
        <View
          style={{
            width: 36,
            height: 4,
            borderRadius: 2,
            backgroundColor: "#E0E0E0",
            alignSelf: "center",
            marginBottom: 4,
          }}
        />

        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 20, fontWeight: "600", color: "#1A1A1A" }}>
            Connect your Oura Ring
          </Text>
          <Text style={{ fontSize: 14, color: "#6B6B6B", lineHeight: 20 }}>
            We'll sync your sleep and recovery data automatically.
          </Text>
        </View>

        {syncing ? (
          <View style={{ alignItems: "center", paddingVertical: 16, gap: 12 }}>
            <ActivityIndicator color="#1A1A1A" />
            <Text style={{ fontSize: 14, color: "#6B6B6B" }}>Syncing your data…</Text>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            <TouchableOpacity
              activeOpacity={1}
              onPressIn={signInPressIn}
              onPressOut={signInPressOut}
              style={{
                backgroundColor: "#1A1A1A",
                borderRadius: 14,
                paddingVertical: 16,
                alignItems: "center",
                opacity: request ? 1 : 0.4,
                transform: [{ scale: signInScale }],
              } as any}
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

            <TouchableOpacity
              activeOpacity={1}
              onPressIn={skipPressIn}
              onPressOut={skipPressOut}
              onPress={onDismiss}
              style={{ transform: [{ scale: skipScale }] } as any}
            >
              <Text style={{ fontSize: 14, color: "#9B9B9B", textAlign: "center" }}>
                Skip for now
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}
