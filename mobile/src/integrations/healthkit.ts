import Constants, { ExecutionEnvironment } from "expo-constants";
import { Platform } from "react-native";
import { api } from "../api/http";

// Apple Health, read-only, HealthKit v1 scope: sleep, HRV (SDNN) and resting
// heart rate. Raw samples stay on the phone; only one summary per day is sent.
// Needs a development build: Expo Go has no HealthKit module, so this reports
// "unavailable" there instead of crashing.

type HK = typeof import("@kingstinct/react-native-healthkit");

const SLEEP = "HKCategoryTypeIdentifierSleepAnalysis";
const HRV = "HKQuantityTypeIdentifierHeartRateVariabilitySDNN";
const RHR = "HKQuantityTypeIdentifierRestingHeartRate";
const ASLEEP = new Set([1, 3, 4, 5]); // asleep(unspecified), core, deep, REM — not inBed (0) or awake (2)

let cached: HK | null | undefined;
function healthkit(): HK | null {
  if (cached !== undefined) return cached;
  if (Platform.OS !== "ios" || Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return (cached = null);
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require("@kingstinct/react-native-healthkit") as HK;
  } catch {
    cached = null;
  }
  return cached;
}

export function healthAvailable(): boolean {
  try {
    return !!healthkit()?.isHealthDataAvailable();
  } catch {
    return false;
  }
}

export async function connectHealth(): Promise<boolean> {
  const hk = healthkit();
  if (!hk) return false;
  return hk.requestAuthorization({ toRead: [SLEEP, HRV, RHR] });
}

type Span = [number, number];

// Overlapping samples (watch + phone) are merged so time is never counted twice.
function mergedMinutes(spans: Span[]): number {
  const sorted = [...spans].sort((a, b) => a[0] - b[0]);
  let total = 0;
  let cur: Span | null = null;
  for (const s of sorted) {
    if (!cur || s[0] > cur[1]) {
      if (cur) total += cur[1] - cur[0];
      cur = [s[0], s[1]];
    } else cur[1] = Math.max(cur[1], s[1]);
  }
  if (cur) total += cur[1] - cur[0];
  return total / 60000;
}

const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export interface HealthDay {
  local_date: string;
  sleep_minutes?: number;
  hrv_sdnn_ms?: number;
  resting_hr?: number;
}

// The night that ends on a day: 6pm the evening before → noon that day (local time).
function nightOf(day: Date): [Date, Date] {
  const start = new Date(day); start.setDate(start.getDate() - 1); start.setHours(18, 0, 0, 0);
  const end = new Date(day); end.setHours(12, 0, 0, 0);
  return [start, end];
}

export async function summarizeHealth(days = 30): Promise<HealthDay[]> {
  const hk = healthkit();
  if (!hk) return [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const from = new Date(today); from.setDate(from.getDate() - days - 1); from.setHours(18, 0, 0, 0);
  const filter = { date: { startDate: from, endDate: new Date() } };

  const [sleep, hrv, rhr] = await Promise.all([
    hk.queryCategorySamples(SLEEP, { limit: 0, filter }),
    hk.queryQuantitySamples(HRV, { limit: 0, unit: "ms", filter }),
    hk.queryQuantitySamples(RHR, { limit: 0, unit: "count/min", filter }),
  ]);

  const out: HealthDay[] = [];
  for (let i = days; i >= 0; i--) {
    const day = new Date(today); day.setDate(day.getDate() - i);
    const [ns, ne] = nightOf(day).map((d) => d.getTime());
    const asleep: Span[] = sleep
      .filter((s) => ASLEEP.has(Number(s.value)))
      .map((s) => [Math.max(+new Date(s.startDate), ns), Math.min(+new Date(s.endDate), ne)] as Span)
      .filter(([a, b]) => b > a);
    const nightHrv = hrv.filter((s) => +new Date(s.startDate) >= ns && +new Date(s.startDate) < ne).map((s) => s.quantity);
    const dayRhr = rhr.filter((s) => isoDay(new Date(s.startDate)) === isoDay(day)).map((s) => s.quantity);

    const row: HealthDay = { local_date: isoDay(day) };
    if (asleep.length) row.sleep_minutes = Math.round(mergedMinutes(asleep));
    if (nightHrv.length) row.hrv_sdnn_ms = Math.round((nightHrv.reduce((a, b) => a + b, 0) / nightHrv.length) * 10) / 10;
    if (dayRhr.length) row.resting_hr = Math.round(dayRhr[dayRhr.length - 1]);
    if (row.sleep_minutes !== undefined || row.hrv_sdnn_ms !== undefined || row.resting_hr !== undefined) out.push(row);
  }
  return out;
}

export async function syncHealth(days = 30, asUser?: string): Promise<number> {
  const summary = await summarizeHealth(days);
  const res = await api<{ days_written: number }>("/connections/apple-health/days", {
    method: "POST", asUser, json: { days: summary },
  });
  return res.days_written;
}
