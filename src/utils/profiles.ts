import type { Profile, ProfileInput, ProfileValidationErrors } from '@/types/profile';
import { GENDER_LABELS } from '@/utils/bmi';
import { cleanDisplayName, validateName } from '@/utils/names';

function dateParts(value: Date): { year: number; month: number; day: number } {
  return { year: value.getFullYear(), month: value.getMonth() + 1, day: value.getDate() };
}

function birthDateParts(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return { year, month, day };
}

export function toBirthDateKey(value: Date): string {
  const { year, month, day } = dateParts(value);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function fromBirthDateKey(value: string): Date | null {
  const parts = birthDateParts(value);
  return parts ? new Date(parts.year, parts.month - 1, parts.day, 12) : null;
}

export function calculateAgeOnDate(dateOfBirth: string, onDate: Date): number {
  const birth = birthDateParts(dateOfBirth);
  if (!birth) return Number.NaN;
  const current = dateParts(onDate);
  let age = current.year - birth.year;
  if (current.month < birth.month || (current.month === birth.month && current.day < birth.day)) age -= 1;
  return age;
}

export function profileAgeOnDate(
  profile: Pick<Profile, 'ageSource' | 'ageYears' | 'dateOfBirth'>,
  onDate: Date,
): number {
  if (profile.ageSource === 'age') return profile.ageYears ?? Number.NaN;
  return profile.dateOfBirth ? calculateAgeOnDate(profile.dateOfBirth, onDate) : Number.NaN;
}

export function validateProfileInput(input: ProfileInput, today = new Date()): ProfileValidationErrors {
  const errors: ProfileValidationErrors = {};
  const nameError = validateName(input.name);
  if (nameError) errors.name = nameError;

  if (input.ageSource === 'age') {
    if (!Number.isInteger(input.ageYears) || (input.ageYears ?? 0) < 18 || (input.ageYears ?? 0) > 150) {
      errors.age = 'Enter an age from 18 to 150.';
    }
  } else if (!input.dateOfBirth || !birthDateParts(input.dateOfBirth)) {
    errors.dateOfBirth = 'Choose a valid date of birth.';
  } else {
    const age = calculateAgeOnDate(input.dateOfBirth, today);
    if (age < 18 || age > 150) errors.dateOfBirth = 'Profiles are available for adults aged 18 to 150.';
  }

  if (!(input.gender in GENDER_LABELS)) errors.gender = 'Choose a gender option.';
  if (!Number.isFinite(input.heightCm) || input.heightCm <= 0) errors.height = 'Enter a height greater than 0.';
  return errors;
}

export function normalizedProfileInput(input: ProfileInput): ProfileInput {
  return {
    ...input,
    name: cleanDisplayName(input.name),
    ageYears: input.ageSource === 'age' ? input.ageYears : null,
    dateOfBirth: input.ageSource === 'dob' ? input.dateOfBirth : null,
  };
}
