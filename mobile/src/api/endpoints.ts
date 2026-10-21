import { api } from "./http";
import type { CheckinInput, Profile, Task, Today } from "./types";

export const getMe = () => api<Profile>("/me");
export const updateMe = (values: Partial<{
  display_name: string | null;
  timezone: string;
  onboarding_completed: boolean;
  onboarding_step: string | null;
  onboarding_answers: Record<string, unknown>;
  ai_task_titles_consented: boolean;
}>) => api<Profile>("/me", { method: "PATCH", json: values });

export const getToday = () => api<Today>("/today");
export const createCheckin = (input: CheckinInput) => api("/checkins", { method: "POST", json: input });

export const createTask = (title: string) => api<Task>("/tasks", { method: "POST", json: { title } });
export const setCompleted = (id: string, completed: boolean) =>
  api<Task>(`/tasks/${id}`, { method: "PATCH", json: { completed } });
export const makePriority = (id: string) => api<Task>(`/tasks/${id}/priority`, { method: "PUT" });
export const clearPriority = (id: string) => api<Task>(`/tasks/${id}/priority`, { method: "DELETE" });

export interface Area { id: string; name: string; color_family: string | null }
export const listAreas = () => api<Area[]>("/areas");

export type ConnectionState = "syncing" | "up_to_date" | "not_yet" | "delayed" | "expired" | "off" | "unavailable";
export interface ConnectionStatus {
  provider: "oura" | "apple_health" | "apple_calendar" | "google_calendar";
  state: ConnectionState;
  last_synced_at: string | null;
}
export const getConnections = () => api<ConnectionStatus[]>("/connections");
export const ouraAuthorizeUrl = () => api<{ url: string }>("/connections/oura/authorize", { method: "POST" });
export const ouraSync = () => api<{ days_written: number }>("/connections/oura/sync", { method: "POST" });
export const ouraDisconnect = () => api<void>("/connections/oura", { method: "DELETE" });

export const createArea = (name: string, color_family: string) =>
  api<Area>("/areas", { method: "POST", json: { name, color_family } });
export const deleteArea = (id: string) => api<void>(`/areas/${id}`, { method: "DELETE" });

// ── Tasks ─────────────────────────────────────────────────────────────────────
export const listTasks = () => api<Task[]>("/tasks");
export const createTaskWith = (values: { title: string; area_id?: string | null; focus_on?: string | null;
  due_on?: string | null; source?: "capture" | "brain_dump" }) => api<Task>("/tasks", { method: "POST", json: values });
export const updateTask = (id: string, values: Record<string, unknown>) =>
  api<Task>(`/tasks/${id}`, { method: "PATCH", json: values });

// ── You ───────────────────────────────────────────────────────────────────────
export interface Goal { id: string; title: string; notes: string | null }
export interface Rhythm { id: string; title: string; cadence_note: string | null }
export interface Help { id: string; text: string }
export const listGoals = () => api<Goal[]>("/goals");
export const createGoal = (title: string, notes?: string) => api<Goal>("/goals", { method: "POST", json: { title, notes: notes || null } });
export const deleteGoal = (id: string) => api<void>(`/goals/${id}`, { method: "DELETE" });
export const listRhythms = () => api<Rhythm[]>("/rhythms");
export const createRhythm = (title: string, cadence_note?: string) =>
  api<Rhythm>("/rhythms", { method: "POST", json: { title, cadence_note: cadence_note || null } });
export const deleteRhythm = (id: string) => api<void>(`/rhythms/${id}`, { method: "DELETE" });
export const listHelps = () => api<Help[]>("/what-helps");
// One observation from the past week's linked records, or nulls when there's nothing real to say.
export type Reflection = { kind: "goal" | "rhythm" | "priorities" | "tasks" | null; text: string | null };
export const getReflection = () => api<Reflection>("/you/reflection");
export const createHelp = (text: string) => api<Help>("/what-helps", { method: "POST", json: { text } });
export const deleteHelp = (id: string) => api<void>(`/what-helps/${id}`, { method: "DELETE" });

// ── Plan ──────────────────────────────────────────────────────────────────────
export type PlanKind = "calendar" | "event" | "commitment" | "routine" | "habit" | "protected" | "task" | "reset" | "focus";
export interface PlanItem {
  id: string; kind: PlanKind; source: string; external_id: string | null; title: string | null;
  starts_at: string; ends_at: string; all_day: boolean; area_id: string | null; task_id: string | null;
  editable: boolean; completed: boolean;
}
export interface PlanTask {
  id: string; title: string; focus_on: string | null; due_on: string | null; completed_at: string | null;
  area_id: string | null; priority_rank: number | null; estimate_minutes: number | null;
}
export interface Plan {
  timezone: string; start: string; end: string;
  days: { date: string; status: string | null; state: string | null }[];
  items: PlanItem[]; tasks: PlanTask[];
  open_windows: { starts_at: string; ends_at: string }[] | null;
}
export const getPlan = (start: string, days: number) => api<Plan>(`/plan?start=${start}&days=${days}`);
export const createBlock = (values: { kind: "event" | "protected" | "task"; title?: string | null; task_id?: string;
  area_id?: string | null; starts_at: string; ends_at: string }) => api<PlanItem>("/plan/blocks", { method: "POST", json: values });
export const updateBlock = (id: string, values: Record<string, unknown>) =>
  api<PlanItem>(`/plan/blocks/${id}`, { method: "PATCH", json: values });
export const deleteBlock = (id: string) => api<void>(`/plan/blocks/${id}`, { method: "DELETE" });

// ── Insights ──────────────────────────────────────────────────────────────────
export interface Reading {
  source: string; readiness: number | null; sleep_minutes: number | null; hrv_ms: number | null;
  hrv_method: string | null; resting_hr: number | null;
}
export interface RhythmDay { status: string; state: string | null; possible_states: string[]; confidence: string | null; pathway: string }
export interface InsightDay { date: string; rhythm: RhythmDay | null; reading: Reading | null; checked_in: boolean }
export interface Insights {
  days: InsightDay[];
  breakdown: {
    days_so_far: number; assessed_days: number; uncertain_days: number; reading_only_days: number; no_data_days: number;
    states: { state: string; days: number }[]; summary: string;
  };
  patterns: { title: string; body: string }[];
  where_time_went: { area_id: string; name: string; color_family: string | null; minutes: number }[];
}
export interface DayDetail {
  date: string; rhythm: RhythmDay | null; basis: string | null; evidence: string[]; disagreements: string[];
  interpretation: string | null; reading: Reading | null; calendar: string | null;
  checkins: { recorded_at: string; energy: string | null; rested: string | null; perceived_demand: string | null; context_tags: string[] }[];
}
export const getInsights = (start: string, end: string) => api<Insights>(`/insights?start=${start}&end=${end}`);
export const getDayDetail = (date: string) => api<DayDetail>(`/insights/days/${date}`);

// Deletes the account, all of its data and connections, and the sign-in itself.
export const deleteAccount = (appleAuthorizationCode?: string) =>
  api<{ account_deleted: boolean; oura_revoked: boolean | null }>("/me", {
    method: "DELETE", json: { confirm: true, apple_authorization_code: appleAuthorizationCode ?? null },
  });
