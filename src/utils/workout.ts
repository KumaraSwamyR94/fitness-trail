import type { ExerciseType, WorkoutSetSummary } from '@/types/workout';
import { formatWeight } from '@/utils/weight';

export const EXERCISE_TYPE_OPTIONS: readonly { value: ExerciseType; label: string }[] = [
  { value: 'free_weight', label: 'Free Weight' },
  { value: 'machine', label: 'Machine' },
  { value: 'body_weight', label: 'Body Weight' },
  { value: 'cardio', label: 'Cardio' },
];

export function exerciseTypeLabel(type: ExerciseType): string {
  return EXERCISE_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? 'Exercise';
}

export function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function formatSetSummary(set: WorkoutSetSummary): string {
  if (set.kind === 'duration') return `${formatDuration(set.durationSeconds)} duration`;
  if (set.kind === 'calories') return `${set.calories} kcal`;
  const load =
    set.inputWeight === null
      ? 'body weight'
      : `${formatWeight(set.inputUnit === 'lb' ? (set.weightLb ?? 0) : (set.weightKg ?? 0))} ${set.inputUnit}`;
  return `${load} × ${set.reps}`;
}
