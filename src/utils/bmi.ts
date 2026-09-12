import type {
  BmiCategory,
  BmiMeasurement,
  BmiMeasurementInput,
  BmiMetric,
  BmiRange,
  BmiValidationErrors,
  Gender,
  HeightUnit,
} from '@/types/bmi';
import type { WeightUnit } from '@/types/workout';
import { convertWeight } from '@/utils/weight';

export const CENTIMETERS_PER_INCH = 2.54;
export const INCHES_PER_FOOT = 12;

const RANGE_DAYS: Exclude<BmiRange, 'All'>[] = ['1W', '30D', '90D'];
const RANGE_MILLISECONDS: Record<Exclude<BmiRange, 'All'>, number> = {
  '1W': 7 * 24 * 60 * 60 * 1000,
  '30D': 30 * 24 * 60 * 60 * 1000,
  '90D': 90 * 24 * 60 * 60 * 1000,
};

export const BMI_RANGES: readonly BmiRange[] = [...RANGE_DAYS, 'All'];

export const GENDER_LABELS: Record<Gender, string> = {
  woman: 'Woman',
  man: 'Man',
  non_binary: 'Non-binary',
  prefer_not_to_say: 'Prefer not to say',
};

export const BMI_CATEGORY_LABELS: Record<BmiCategory, string> = {
  underweight: 'Underweight',
  healthy: 'Healthy weight',
  overweight: 'Overweight',
  obesity: 'Obesity',
};

export function feetInchesToCentimeters(feet: number, inches: number): number {
  if (
    !Number.isInteger(feet) ||
    feet < 0 ||
    !Number.isFinite(inches) ||
    inches < 0 ||
    inches >= 12
  ) {
    return Number.NaN;
  }
  return (feet * INCHES_PER_FOOT + inches) * CENTIMETERS_PER_INCH;
}

export function centimetersToFeetInches(heightCm: number): { feet: number; inches: number } {
  if (!Number.isFinite(heightCm) || heightCm <= 0) return { feet: 0, inches: 0 };
  const totalInches = heightCm / CENTIMETERS_PER_INCH;
  const feet = Math.floor(totalInches / INCHES_PER_FOOT);
  return { feet, inches: totalInches - feet * INCHES_PER_FOOT };
}

export function convertWeightValue(value: number, from: WeightUnit, to: WeightUnit): number {
  if (from === to) return value;
  const converted = convertWeight(value, from);
  return to === 'kg' ? converted.weightKg : converted.weightLb;
}

export function calculateBmi(weightKg: number, heightCm: number): number {
  if (!Number.isFinite(weightKg) || weightKg <= 0 || !Number.isFinite(heightCm) || heightCm <= 0) {
    return Number.NaN;
  }
  const heightMeters = heightCm / 100;
  return weightKg / (heightMeters * heightMeters);
}

export function classifyAdultBmi(bmi: number): BmiCategory {
  if (bmi < 18.5) return 'underweight';
  if (bmi < 25) return 'healthy';
  if (bmi < 30) return 'overweight';
  return 'obesity';
}

export function formatBmi(bmi: number): string {
  return Number.isFinite(bmi) ? bmi.toFixed(1) : '—';
}

export function formatHeight(heightCm: number, unit: HeightUnit): string {
  if (!Number.isFinite(heightCm) || heightCm <= 0) return '—';
  if (unit === 'cm') return `${heightCm.toFixed(1)} cm`;
  const { feet, inches } = centimetersToFeetInches(heightCm);
  return `${feet} ft ${inches.toFixed(1)} in`;
}

export function validateBmiMeasurementInput(
  input: BmiMeasurementInput,
  now = Date.now(),
): BmiValidationErrors {
  const errors: BmiValidationErrors = {};
  const measuredAt = input.measuredAt.getTime();
  if (!Number.isFinite(measuredAt)) errors.measuredAt = 'Choose a valid measurement date and time.';
  else if (measuredAt > now)
    errors.measuredAt = 'Measurement date and time cannot be in the future.';
  if (!Number.isFinite(input.inputWeight) || input.inputWeight <= 0) {
    errors.weight = 'Enter a weight greater than 0.';
  }
  if (!Number.isFinite(input.heightCm) || input.heightCm <= 0) {
    errors.height = 'Enter a valid height greater than 0.';
  }
  if (!Number.isInteger(input.ageYears) || input.ageYears < 18 || input.ageYears > 150) {
    errors.age = 'Enter a whole-number age from 18 to 150.';
  }
  if (!(input.gender in GENDER_LABELS)) errors.gender = 'Choose a gender option.';
  return errors;
}

export function firstBmiValidationError(errors: BmiValidationErrors): string | null {
  return errors.measuredAt ?? errors.weight ?? errors.height ?? errors.age ?? errors.gender ?? null;
}

export function filterMeasurementsByRange(
  measurements: BmiMeasurement[],
  range: BmiRange,
  now = Date.now(),
): BmiMeasurement[] {
  if (range === 'All') return measurements;
  const cutoff = now - RANGE_MILLISECONDS[range];
  return measurements.filter(
    (measurement) => measurement.measuredAt >= cutoff && measurement.measuredAt <= now,
  );
}

export function calculateBmiRangeAverages(
  measurements: BmiMeasurement[],
  weightUnit: WeightUnit,
): { averageBmi: number | null; averageWeight: number | null } {
  if (measurements.length === 0) return { averageBmi: null, averageWeight: null };

  const totals = measurements.reduce(
    (current, measurement) => ({
      bmi: current.bmi + measurement.bmi,
      weight: current.weight + (weightUnit === 'kg' ? measurement.weightKg : measurement.weightLb),
    }),
    { bmi: 0, weight: 0 },
  );

  return {
    averageBmi: totals.bmi / measurements.length,
    averageWeight: totals.weight / measurements.length,
  };
}

export function getChartDomain(values: number[], metric: BmiMetric): { min: number; max: number } {
  const finiteValues = values.filter(Number.isFinite);
  if (finiteValues.length === 0) return { min: 0, max: 1 };
  const minimum = Math.min(...finiteValues);
  const maximum = Math.max(...finiteValues);
  const span = maximum - minimum;
  const padding =
    span === 0 ? (metric === 'bmi' ? 1 : Math.max(Math.abs(minimum) * 0.05, 1)) : span * 0.12;
  return { min: Math.max(0, minimum - padding), max: maximum + padding };
}
