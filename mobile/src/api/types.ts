// Mirrors the backend response models (backend/routers/today.py, tasks.py, me.py).

export type StateName = "Aligned" | "Balanced" | "Strained" | "Overloaded";
export type Level = "very_low" | "low" | "moderate" | "high" | "very_high";
export type Demand = "very_light" | "light" | "moderate" | "heavy" | "very_heavy";

export interface Profile {
  id: string;
  email: string | null;
  display_name: string | null;
  timezone: string;
  onboarding_completed: boolean;
  onboarding_step: string | null;
  onboarding_answers: Record<string, unknown>;
  preferred_health_source: "oura" | "apple_health" | null;
  ai_task_titles_consented: boolean;
}

export interface Task {
  id: string;
  title: string;
  area_id: string | null;
  effort: "light" | "moderate" | "deep" | null;
  estimate_minutes: number | null;
  due_on: string | null;
  focus_on: string | null;
  priority_rank: number | null;
  completed_at: string | null;
  times_deferred: number;
  first_focus_on: string | null;
  source?: string;
}

export interface Today {
  date: string;
  timezone: string;
  now: string;
  capacity: {
    status: "assessed" | "uncertain" | "insufficient_evidence";
    state: StateName | null;
    possible_states: StateName[];
    confidence: "low" | "medium" | "high" | null;
    pathway: "none" | "self_reported" | "connected" | "hybrid";
    source_label: string | null;
    context: string | null;
    checked_in_today: boolean;
    next_actions: string[];
  };
  what_matters_now: {
    kind: string;
    text: string;
    highlight: string | null;
    task_id: string | null;
    worded_by: "rules" | "model";
  } | null;
  priorities: Task[];
  schedule: {
    upcoming: {
      id: string;
      kind: "calendar" | "rhythm";
      source: string;
      external_id: string | null;
      title: string | null;
      starts_at: string;
      ends_at: string;
      area_id: string | null;
    }[];
    calendar_connected: boolean;
  };
}

export interface CheckinInput {
  energy?: Level;
  rested?: Level;
  perceived_demand?: Demand;
  context_tags?: ("sleep" | "stress" | "illness" | "emotions" | "none")[];
}
