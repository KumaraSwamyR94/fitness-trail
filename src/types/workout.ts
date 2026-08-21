export type WeightUnit = 'kg' | 'lb';
export type ExerciseType = 'free_weight' | 'machine' | 'body_weight' | 'cardio';
export type SetKind = 'strength' | 'duration' | 'calories';
export type SupersetRoundStatus = 'in_progress' | 'completed';
export type SupersetRoundEntryStatus = 'pending' | 'completed' | 'skipped';

export interface Session {
  id: string;
  profileId: string;
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
  muscleGroupId: string | null;
  muscleGroupName: string | null;
  exerciseType: ExerciseType;
  useCount: number;
  lastUsedAt: number;
}

export interface MuscleGroupCatalogEntry {
  id: string;
  normalizedName: string;
  displayName: string;
  isPredefined: boolean;
  useCount: number;
  lastUsedAt: number;
}

export interface SessionExercise {
  id: string;
  sessionId: string;
  catalogId: string | null;
  displayName: string;
  normalizedName: string;
  muscleGroupId: string | null;
  muscleGroupName: string | null;
  exerciseType: ExerciseType;
  position: number;
  createdAt: number;
  updatedAt: number;
}

export interface ExerciseSummary extends SessionExercise {
  setCount: number;
  lastSet: WorkoutSetSummary | null;
}

export interface SupersetMember {
  supersetId: string;
  exercise: ExerciseSummary;
  position: number;
}

export interface Superset {
  id: string;
  sessionId: string;
  templateId: string | null;
  name: string;
  members: SupersetMember[];
  completedRoundCount: number;
  hasPendingEntries: boolean;
  membershipLocked: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface SupersetRoundEntry {
  id: string;
  roundId: string;
  exercise: SessionExercise;
  position: number;
  status: SupersetRoundEntryStatus;
  workoutSet: WorkoutSet | null;
  createdAt: number;
  updatedAt: number;
}

export interface SupersetRound {
  id: string;
  supersetId: string;
  position: number;
  status: SupersetRoundStatus;
  entries: SupersetRoundEntry[];
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
}

export interface SupersetDetails extends Superset {
  rounds: SupersetRound[];
}

export interface SupersetTemplateMember {
  id: string;
  templateId: string;
  catalogId: string | null;
  displayName: string;
  normalizedName: string;
  muscleGroupId: string | null;
  muscleGroupName: string | null;
  exerciseType: ExerciseType;
  position: number;
}

export interface SupersetTemplate {
  id: string;
  profileId: string;
  name: string;
  members: SupersetTemplateMember[];
  createdAt: number;
  updatedAt: number;
}

export type SessionWorkoutItem =
  | { kind: 'exercise'; id: string; exercise: ExerciseSummary }
  | { kind: 'superset'; id: string; superset: Superset };

export interface SupersetMemberInput {
  existingExerciseId?: string;
  catalogId?: string | null;
  displayName: string;
  muscleGroupName: string;
  exerciseType: ExerciseType;
}

export interface SupersetInput {
  name?: string;
  members: SupersetMemberInput[];
  saveAsTemplate?: boolean;
  templateId?: string | null;
}

interface WorkoutSetBase {
  id: string;
  exerciseId: string;
  position: number;
  kind: SetKind;
  createdAt: number;
  updatedAt: number;
}

export interface StrengthWorkoutSet extends WorkoutSetBase {
  kind: 'strength';
  reps: number;
  inputWeight: number | null;
  inputUnit: WeightUnit;
  weightKg: number | null;
  weightLb: number | null;
  tutSeconds: number;
}

export interface DurationWorkoutSet extends WorkoutSetBase {
  kind: 'duration';
  durationSeconds: number;
}

export interface CaloriesWorkoutSet extends WorkoutSetBase {
  kind: 'calories';
  calories: number;
}

export type WorkoutSet = StrengthWorkoutSet | DurationWorkoutSet | CaloriesWorkoutSet;

export interface PreviousExerciseWorkout {
  sessionId: string;
  sessionName: string;
  scheduledAt: number;
  exerciseId: string;
  exerciseName: string;
  exerciseType: ExerciseType;
  sets: WorkoutSet[];
}

type WorkoutSetMetadata = 'id' | 'exerciseId' | 'position' | 'createdAt' | 'updatedAt';
export type WorkoutSetSummary =
  | Omit<StrengthWorkoutSet, WorkoutSetMetadata>
  | Omit<DurationWorkoutSet, WorkoutSetMetadata>
  | Omit<CaloriesWorkoutSet, WorkoutSetMetadata>;

export interface StrengthSetInput {
  kind: 'strength';
  reps: number;
  inputWeight: number | null;
  inputUnit: WeightUnit;
  tutSeconds: number;
}

export interface DurationSetInput {
  kind: 'duration';
  durationSeconds: number;
}

export interface CaloriesSetInput {
  kind: 'calories';
  calories: number;
}

export type SetInput = StrengthSetInput | DurationSetInput | CaloriesSetInput;
