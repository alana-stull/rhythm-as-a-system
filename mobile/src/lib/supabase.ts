import "react-native-url-polyfill/auto";
import { createClient, SupportedStorage } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { AppState } from "react-native";

// Sessions live in the iOS Keychain (SecureStore). Values there are capped at
// about 2 KB, and a Supabase session can be larger, so it's stored in chunks.
const CHUNK = 1800;
const safe = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, "_");

const keychainStorage: SupportedStorage = {
  async getItem(key) {
    const count = await SecureStore.getItemAsync(`${safe(key)}.n`);
    if (!count) return null;
    const parts = await Promise.all(
      Array.from({ length: Number(count) }, (_, i) => SecureStore.getItemAsync(`${safe(key)}.${i}`)),
    );
    return parts.some((p) => p === null) ? null : parts.join("");
  },
  async setItem(key, value) {
    await keychainStorage.removeItem(key);
    const parts = value.match(new RegExp(`[\\s\\S]{1,${CHUNK}}`, "g")) ?? [""];
    await Promise.all(parts.map((p, i) => SecureStore.setItemAsync(`${safe(key)}.${i}`, p)));
    await SecureStore.setItemAsync(`${safe(key)}.n`, String(parts.length));
  },
  async removeItem(key) {
    const count = Number((await SecureStore.getItemAsync(`${safe(key)}.n`)) ?? 0);
    await Promise.all(Array.from({ length: count }, (_, i) => SecureStore.deleteItemAsync(`${safe(key)}.${i}`)));
    await SecureStore.deleteItemAsync(`${safe(key)}.n`);
  },
};

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
// Release builds accept only an https project URL.
export const supabaseConfigured = Boolean(url && anonKey) && (__DEV__ || url!.startsWith("https://"));

export const supabase = createClient(url ?? "http://not-configured.invalid", anonKey ?? "not-configured", {
  auth: { storage: keychainStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});

// Refresh tokens only while the app is in the foreground (Supabase's React Native guidance).
AppState.addEventListener("change", (state) => {
  if (state === "active") supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
