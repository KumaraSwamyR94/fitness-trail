export type WeightUnit = 'kg' | 'lb';

export interface Session {
  id: string;
  name: string;
  scheduledAt: number;
  localDate: string;
  timezoneOffsetMinutes: number;
  createdAt: number;
  updatedAt: number;
}

export interface SessionSummary extends Session {
  exerciseCount: number;
  setCount: number;
}

export interface ExerciseCatalogEntry {
  id: string;
  normalizedName: string;
  displayName: string;
  useCount: number;
  lastUsedAt: number;
}

export interface SessionExercise {
  id: string;
  sessionId: string;
  catalogId: string | null;
  displayName: string;
  normalizedName: string;
  position: number;
  createdAt: number;
  updatedAt: number;
}

export interface ExerciseSummary extends SessionExercise {
  setCount: number;
  lastReps: number | null;
  lastWeightKg: number | null;
  lastWeightLb: number | null;
  lastInputUnit: WeightUnit | null;
}

export interface WorkoutSet {
  id: string;
  exerciseId: string;
  position: number;
  reps: number;
  inputWeight: number;
  inputUnit: WeightUnit;
  weightKg: number;
  weightLb: number;
  tutSeconds: number;
  createdAt: number;
  updatedAt: number;
}

export interface SetInput {
  reps: number;
  inputWeight: number;
  inputUnit: WeightUnit;
  tutSeconds: number;
}
