import * as WebBrowser from "expo-web-browser";
import { ouraAuthorizeUrl, ouraSync } from "../api/endpoints";
import { calendarPermission, syncCalendar } from "./calendar";
import { connectHealth, syncHealth } from "./healthkit";

// One place for "Connect" (Settings and onboarding). Each throws a message that's safe to show.

export async function connectOura(): Promise<void> {
  const { url } = await ouraAuthorizeUrl();
  const result = await WebBrowser.openAuthSessionAsync(url, "rhythm://connections");
  if (result.type !== "success") return; // dismissed
  if (!result.url.includes("status=connected")) throw new Error("Oura didn't connect. Try again.");
  await ouraSync();
}

export async function connectCalendar(): Promise<void> {
  if (!(await calendarPermission(true))) throw new Error("Calendar access is off. You can turn it on in iOS Settings.");
  await syncCalendar();
}

export async function connectAppleHealth(): Promise<void> {
  if (!(await connectHealth())) throw new Error("Apple Health access wasn't granted.");
  await syncHealth();
}
