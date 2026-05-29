import * as WebBrowser from "expo-web-browser";
import { doc, getDoc, setDoc } from "firebase/firestore";
import {
  ConfirmationResult,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPhoneNumber,
  signOut as fbSignOut,
  User,
} from "firebase/auth";
import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { auth, db } from "../firebase";

// Required for OAuth redirect completion on mobile
WebBrowser.maybeCompleteAuthSession();

// Set these in your Firebase console when building production auth
const GOOGLE_WEB_CLIENT_ID = ""; // TODO: configure for production
const GOOGLE_IOS_CLIENT_ID = "";
const GOOGLE_ANDROID_CLIENT_ID = "";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AuthState {
  user: User | null;
  userName: string;
  loading: boolean;
  onboardingComplete: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithPhone: (phone: string) => Promise<void>;
  confirmOTP: (code: string) => Promise<void>;
  signOut: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userName, setUserName] = useState("");
  const [loading, setLoading] = useState(true);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const confirmationRef = useRef<ConfirmationResult | null>(null);

  // Google OAuth — client IDs come from Firebase console (currently disabled for dev)
  // const [, googleResponse, promptGoogleAsync] = Google.useAuthRequest({
  //   webClientId: GOOGLE_WEB_CLIENT_ID || undefined,
  //   iosClientId: GOOGLE_IOS_CLIENT_ID || undefined,
  //   androidClientId: GOOGLE_ANDROID_CLIENT_ID || undefined,
  // });

  // // Complete Google sign-in once OAuth redirects back
  // useEffect(() => {
  //   if (googleResponse?.type !== "success") return;
  //   const idToken = googleResponse.params?.id_token;
  //   if (!idToken) return;
  //   const credential = GoogleAuthProvider.credential(idToken);
  //   signInWithCredential(auth, credential).catch(console.error);
  // }, [googleResponse]);

  // Watch Firebase auth state; on sign-in read Firestore user doc
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      setUser(fbUser);

      if (fbUser) {
        // Derive first name from Google display name; Firestore name as fallback
        const displayFirst = fbUser.displayName?.split(" ")[0] ?? "";
        setUserName(displayFirst || "User");

        try {
          const snap = await getDoc(doc(db, "users", fbUser.uid));
          if (snap.exists()) {
            const data = snap.data();
            setOnboardingComplete(data.onboardingComplete === true);
            if (!displayFirst && data.name) setUserName(data.name as string);
          } else {
            // First sign-in — create doc with onboarding incomplete
            setOnboardingComplete(false);
          }
        } catch {
          setOnboardingComplete(false);
        }
      } else {
        setUserName("");
        setOnboardingComplete(false);
      }

      setLoading(false);
    });

    return unsub;
  }, []);

  // Auto sign-in with anonymous auth on first load
  useEffect(() => {
    const checkAuth = async () => {
      if (!auth.currentUser) {
        try {
          await signInAnonymously(auth);
        } catch (err) {
          console.error("Anonymous auth failed:", err);
        }
      }
    };
    checkAuth();
  }, []);

  // ── Auth actions ────────────────────────────────────────────────────────────

  async function signInWithGoogle() {
    // Demo mode: just log it. Real Google auth requires proper OAuth client setup.
    console.log("Demo: Google sign-in");
  }

  async function signInWithPhone(phone: string) {
    // Demo mode: just log it. Real phone auth requires Firebase reCAPTCHA setup.
    console.log("Demo: phone sign-in for", phone);
  }

  async function confirmOTP(code: string) {
    // Demo mode: just log it. Real OTP confirmation requires Firebase phone auth setup.
    console.log("Demo: OTP confirm for code", code);
  }

  async function signOut() {
    await fbSignOut(auth);
  }

  async function completeOnboarding() {
    if (user) {
      await setDoc(doc(db, "users", user.uid), { onboardingComplete: true }, { merge: true });
    }
    setOnboardingComplete(true);
  }

  return (
    <AuthContext.Provider
      value={{ user, userName, loading, onboardingComplete, signInWithGoogle, signInWithPhone, confirmOTP, signOut, completeOnboarding }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
