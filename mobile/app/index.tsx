import { Redirect } from "expo-router";

// P0: no auth gate yet (F5 adds Supabase sign-in and the onboarding check).
export default function Index() {
  return <Redirect href="/today" />;
}
