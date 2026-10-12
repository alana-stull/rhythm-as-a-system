import { Redirect } from "expo-router";
import { useSession } from "../src/auth/SessionProvider";

export default function Index() {
  const { status, profile } = useSession();
  if (status !== "signedIn") return <Redirect href="/sign-in" />;
  if (!profile?.onboarding_completed) return <Redirect href="/onboarding" />;
  return <Redirect href="/today" />;
}
