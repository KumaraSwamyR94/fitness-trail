import type { Gender, HeightUnit } from '@/types/bmi';

export type ProfileAgeSource = 'age' | 'dob';

export type ProfilePhoto =
  | { kind: 'none'; ref: null }
  | { kind: 'avatar'; ref: string }
  | { kind: 'local'; ref: string };

export interface ProfileInput {
  name: string;
  ageSource: ProfileAgeSource;
  ageYears: number | null;
  dateOfBirth: string | null;
  gender: Gender;
  inputHeightUnit: HeightUnit;
  heightCm: number;
  photo: ProfilePhoto;
}

export interface Profile extends ProfileInput {
  id: string;
  createdAt: number;
  updatedAt: number;
}

export interface ProfileOverview extends Profile {
  sessionCount: number;
  exerciseCount: number;
  setCount: number;
  bmiMeasurementCount: number;
  latestBmi: number | null;
  latestWeight: number | null;
  latestWeightUnit: 'kg' | 'lb' | null;
}

export interface ProfileValidationErrors {
  name?: string;
  age?: string;
  dateOfBirth?: string;
  gender?: string;
  height?: string;
}
