import type { SetInput, WeightUnit } from '@/types/workout';

export const POUNDS_PER_KILOGRAM = 2.20462;

export interface ConvertedWeight {
  weightKg: number;
  weightLb: number;
}

export function convertWeight(value: number, unit: WeightUnit): ConvertedWeight {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('Weight must be a non-negative number.');
  }
  return unit === 'kg'
    ? { weightKg: value, weightLb: value * POUNDS_PER_KILOGRAM }
    : { weightKg: value / POUNDS_PER_KILOGRAM, weightLb: value };
}

export function formatWeight(value: number): string {
  return value.toFixed(2);
}

export function validateSetInput(input: SetInput): string | null {
  if (!Number.isInteger(input.reps) || input.reps < 1) {
    return 'Repetitions must be a whole number of 1 or more.';
  }
  if (!Number.isFinite(input.inputWeight) || input.inputWeight < 0) {
    return 'Weight must be 0 or more.';
  }
  if (!Number.isInteger(input.tutSeconds) || input.tutSeconds < 0) {
    return 'Time under tension must be a whole number of 0 or more.';
  }
  return null;
}
