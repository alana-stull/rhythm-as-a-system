import { isAuthApiError, isAuthRetryableFetchError, type Session } from "@supabase/supabase-js";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { deleteAccount as deleteAccountApi, getMe, updateMe } from "../api/endpoints";
import { ApiError } from "../api/http";
import type { Profile } from "../api/types";
import { resetAutoSync } from "../integrations/autoSync";
import { supabase } from "../lib/supabase";
import { appleCredential } from "./apple";

type Status = "loading" | "signedOut" | "signedIn";

type SessionState = {
  status: Status;
  session: Session | null;
  profile: Profile | null;
  profileError: string | null;
  sendCode: (email: string) => Promise<void>;
  verifyCode: (email: string, code: string) => Promise<void>;
  // false: the person closed the Apple sheet.
  signInWithApple: () => Promise<boolean>;
  // Signs out on this device only; other devices and connected services stay as they are.
  signOut: () => Promise<void>;
  // Deletes the account, its data and connections. false: the person cancelled the Apple confirmation.
  deleteAccount: () => Promise<boolean>;
  refreshProfile: () => Promise<void>;
  setProfile: (p: Profile) => void;
};

const Ctx = createContext<SessionState | null>(null);

const deviceTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

// Supabase's errors, in words a person can act on. Some codes mean different things per path
// (validation_failed is a bad email address on one, an unreadable Apple token on the other).
function friendly(e: unknown, path: "email" | "apple"): Error {
  if (isAuthRetryableFetchError(e)) return new Error("Can't reach Rhythm right now. Check your connection and try again.");
  if (isAuthApiError(e) && path === "apple") {
    if (e.code === "provider_disabled") return new Error("Sign in with Apple isn't turned on yet. Continue with email for now.");
    if (e.status === 429) return new Error("Too many attempts. Wait a minute, then try again.");
    return new Error("Apple sign-in couldn't be confirmed. Try again, or continue with email.");
  }
  if (isAuthApiError(e)) {
    switch (e.code) {
      case "otp_expired":
        return new Error("That code didn't work. It may have expired or have a typo. Check it, or send a new code.");
      case "over_email_send_rate_limit":
      case "over_request_rate_limit":
        return new Error("Too many codes requested. Wait a minute, then send a new one.");
      case "email_address_invalid":
      case "validation_failed":
        return new Error("That email address doesn't look right.");
    }
    if (e.status === 429) return new Error("Too many attempts. Wait a minute, then try again.");
  }
  return e instanceof Error ? e : new Error("Something went wrong. Try again.");
}

const usesApple = (s: Session | null) =>
  !!s && ((s.user.app_metadata?.providers as string[] | undefined)?.includes("apple")
          || !!s.user.identities?.some((i) => i.provider === "apple"));

// Email sign-in with a 6-digit code (Supabase Auth). No guest or preview mode:
// nothing in the app is reachable without a session and a completed onboarding.
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const appleName = useRef<string | null>(null);  // Apple sends a name once; used only if the profile has none

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setStatus(data.session ? "signedIn" : "signedOut");
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setStatus(next ? "signedIn" : "signedOut");
      if (!next) { setProfile(null); resetAutoSync(); }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const refreshProfile = useCallback(async () => {
    try {
      setProfileError(null);
      let me = await getMe();
      if (appleName.current && !me.display_name) me = await updateMe({ display_name: appleName.current });
      appleName.current = null;
      // Keep "today" in the person's own time zone.
      const tz = deviceTimeZone();
      if (me.timezone !== tz) me = await updateMe({ timezone: tz });
      setProfile(me);
    } catch (e) {
      setProfileError(e instanceof Error ? e.message : "Couldn't load your profile.");
    }
  }, []);

  const userId = session?.user.id;
  useEffect(() => {
    if (userId) refreshProfile();
  }, [userId, refreshProfile]);

  const value = useMemo<SessionState>(() => ({
    status,
    session,
    profile,
    profileError,
    // New and returning people take the same path: the code creates the account if there isn't one.
    async sendCode(email) {
      const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
      if (error) throw friendly(error, "email");
    },
    async verifyCode(email, code) {
      const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
      if (error) throw friendly(error, "email");
    },
    async signInWithApple() {
      const c = await appleCredential();
      if (!c) return false;
      appleName.current = c.givenName;
      const { error } = await supabase.auth.signInWithIdToken({ provider: "apple", token: c.identityToken, nonce: c.nonce });
      if (error) { appleName.current = null; throw friendly(error, "apple"); }
      return true;
    },
    async signOut() {
      await supabase.auth.signOut({ scope: "local" });
    },
    async deleteAccount() {
      // Apple requires its tokens to be revoked: a fresh Apple confirmation gives the server a one-time code to do it.
      let code: string | undefined;
      const confirmWithApple = async () => {
        const c = await appleCredential();
        code = c?.authorizationCode;
        return !!c;
      };
      if (usesApple(session) && !(await confirmWithApple())) return false;
      try {
        await deleteAccountApi(code);
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 428) || !(await confirmWithApple())) {
          if (e instanceof ApiError && e.status === 428) return false;
          throw e;
        }
        await deleteAccountApi(code);
      }
      await supabase.auth.signOut({ scope: "local" });  // the account is gone; just clear this device
      return true;
    },
    refreshProfile,
    setProfile,
  }), [status, session, profile, profileError, refreshProfile]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}
