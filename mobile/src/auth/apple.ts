import * as AppleAuthentication from "expo-apple-authentication";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Crypto from "expo-crypto";
import { Platform } from "react-native";

// Native Sign in with Apple. Apple signs an ID token for this app's bundle ID; Supabase verifies it, so the
// app never handles a password or a client secret. A random nonce, hashed for Apple and sent raw to Supabase,
// ties the token to this one sign-in so it can't be replayed.

// Expo Go is a different app (its own bundle ID), so Apple's tokens there are never accepted for Rhythm.
export const appleSignInSupported = Platform.OS === "ios" && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

export type AppleCredential = {
  identityToken: string;
  authorizationCode: string;
  nonce: string;
  givenName: string | null;
};

const CANCELED = new Set(["ERR_REQUEST_CANCELED", "ERR_CANCELED"]);

// null: the person closed the Apple sheet (not an error).
export async function appleCredential(): Promise<AppleCredential | null> {
  if (!appleSignInSupported || !(await AppleAuthentication.isAvailableAsync())) {
    throw new Error("Sign in with Apple isn't available on this device. Continue with email instead.");
  }
  const nonce = Crypto.randomUUID();
  const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);
  try {
    const c = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce: hashed,
    });
    if (!c.identityToken || !c.authorizationCode) throw new Error("Apple didn't finish signing you in. Try again.");
    // Apple shares the name only the first time someone signs in to the app.
    return { identityToken: c.identityToken, authorizationCode: c.authorizationCode, nonce,
             givenName: c.fullName?.givenName?.trim() || null };
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && CANCELED.has(String((e as { code: unknown }).code))) return null;
    throw e instanceof Error && !("code" in e) ? e : new Error("Sign in with Apple didn't work. Try again, or continue with email.");
  }
}
