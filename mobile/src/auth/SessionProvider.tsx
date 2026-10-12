import type { Session } from "@supabase/supabase-js";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getMe, updateMe } from "../api/endpoints";
import type { Profile } from "../api/types";
import { supabase } from "../lib/supabase";

type Status = "loading" | "signedOut" | "signedIn";

type SessionState = {
  status: Status;
  session: Session | null;
  profile: Profile | null;
  profileError: string | null;
  sendCode: (email: string) => Promise<void>;
  verifyCode: (email: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  setProfile: (p: Profile) => void;
};

const Ctx = createContext<SessionState | null>(null);

const deviceTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

// Email sign-in with a 6-digit code (Supabase Auth). No guest or preview mode:
// nothing in the app is reachable without a session and a completed onboarding.
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setStatus(data.session ? "signedIn" : "signedOut");
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setStatus(next ? "signedIn" : "signedOut");
      if (!next) setProfile(null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const refreshProfile = useCallback(async () => {
    try {
      setProfileError(null);
      let me = await getMe();
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
    async sendCode(email) {
      const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
      if (error) throw error;
    },
    async verifyCode(email, code) {
      const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
      if (error) throw error;
    },
    async signOut() {
      await supabase.auth.signOut();
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
