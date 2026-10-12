import { api } from "./http";
import type { CheckinInput, Profile, Task, Today } from "./types";

export const getMe = () => api<Profile>("/me");
export const updateMe = (values: Partial<{
  display_name: string | null;
  timezone: string;
  onboarding_completed: boolean;
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
