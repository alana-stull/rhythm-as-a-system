import { Redirect } from "expo-router";
import { destination } from "../src/auth/routing";
import { useSession } from "../src/auth/SessionProvider";

export default function Index() {
  const { status, profile } = useSession();
  return <Redirect href={destination(status === "signedIn", profile?.onboarding_completed)} />;
}
