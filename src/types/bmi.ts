import type { WeightUnit } from '@/types/workout';

export type HeightUnit = 'cm' | 'ft-in';
export type Gender = 'woman' | 'man' | 'non_binary' | 'prefer_not_to_say';
export type BmiCategory = 'underweight' | 'healthy' | 'overweight' | 'obesity';
export type BmiMetric = 'bmi' | 'weight';
export type BmiRange = '1W' | '30D' | '90D' | 'All';

export interface BmiMeasurementDraft {
  measuredAt: Date;
  inputWeight: number;
  inputWeightUnit: WeightUnit;
}

export interface BmiMeasurementInput extends BmiMeasurementDraft {
  inputHeightUnit: HeightUnit;
  heightCm: number;
  ageYears: number;
  gender: Gender;
}

export interface BmiMeasurement {
  id: string;
  profileId: string;
  measuredAt: number;
  localDate: string;
  timezoneOffsetMinutes: number;
  inputWeight: number;
  inputWeightUnit: WeightUnit;
  weightKg: number;
  weightLb: number;
  inputHeightUnit: HeightUnit;
  heightCm: number;
  ageYears: number;
  gender: Gender;
  bmi: number;
  createdAt: number;
  updatedAt: number;
}

export interface BmiValidationErrors {
  measuredAt?: string;
  weight?: string;
  height?: string;
  age?: string;
  gender?: string;
}
