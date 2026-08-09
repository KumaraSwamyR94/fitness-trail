import type { ProfileInput } from '@/types/profile';
import {
  calculateAgeOnDate,
  profileAgeOnDate,
  toBirthDateKey,
  validateProfileInput,
} from '@/utils/profiles';

const validProfile: ProfileInput = {
  name: 'Alex',
  ageSource: 'age',
  ageYears: 30,
  dateOfBirth: null,
  gender: 'non_binary',
  inputHeightUnit: 'cm',
  heightCm: 175,
  photo: { kind: 'none', ref: null },
};

describe('profile age and validation', () => {
  test('changes age on the exact birthday', () => {
    expect(calculateAgeOnDate('2000-08-10', new Date(2026, 7, 9))).toBe(25);
    expect(calculateAgeOnDate('2000-08-10', new Date(2026, 7, 10))).toBe(26);
  });

  test('handles leap-day birthdays consistently on March 1', () => {
    expect(calculateAgeOnDate('2000-02-29', new Date(2025, 1, 28))).toBe(24);
    expect(calculateAgeOnDate('2000-02-29', new Date(2025, 2, 1))).toBe(25);
  });

  test('keeps manual ages fixed and derives DOB ages at measurement time', () => {
    expect(profileAgeOnDate({ ageSource: 'age', ageYears: 42, dateOfBirth: null }, new Date(2000, 0, 1))).toBe(42);
    expect(profileAgeOnDate({ ageSource: 'dob', ageYears: null, dateOfBirth: '1990-01-10' }, new Date(2026, 0, 9))).toBe(35);
  });

  test('requires adult age, gender, name, and positive height', () => {
    expect(validateProfileInput(validProfile, new Date(2026, 7, 9))).toEqual({});
    expect(validateProfileInput({ ...validProfile, ageYears: 17, heightCm: 0, name: '' })).toEqual(expect.objectContaining({
      age: expect.any(String),
      height: expect.any(String),
      name: expect.any(String),
    }));
    expect(validateProfileInput({ ...validProfile, ageSource: 'dob', ageYears: null, dateOfBirth: '2010-01-01' }, new Date(2026, 7, 9))).toEqual(expect.objectContaining({ dateOfBirth: expect.any(String) }));
  });

  test('stores birth dates as stable local date keys', () => {
    expect(toBirthDateKey(new Date(1992, 10, 5, 12))).toBe('1992-11-05');
  });
});
