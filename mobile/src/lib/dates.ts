// Local calendar-day helpers (ISO yyyy-mm-dd in the phone's time zone).
export const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const fromIso = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
export const startOfWeek = (d: Date) => addDays(d, -((d.getDay() + 6) % 7)); // Monday
export const clock = (value: string | Date) => {
  const d = new Date(value);
  return `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, "0")}`;
};
export const clockAmPm = (value: string | Date) => {
  const d = new Date(value);
  return `${clock(d)} ${d.getHours() >= 12 ? "PM" : "AM"}`;
};
