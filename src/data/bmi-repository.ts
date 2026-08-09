import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { BmiMeasurement, BmiMeasurementDraft, BmiMeasurementInput, Gender, HeightUnit } from '@/types/bmi';
import type { Profile } from '@/types/profile';
import type { WeightUnit } from '@/types/workout';
import { calculateBmi, firstBmiValidationError, validateBmiMeasurementInput } from '@/utils/bmi';
import { toLocalDateKey } from '@/utils/dates';
import { convertWeight } from '@/utils/weight';
import { profileAgeOnDate } from '@/utils/profiles';

interface BmiMeasurementRow {
  id: string;
  profile_id: string;
  measured_at: number;
  local_date: string;
  timezone_offset_minutes: number;
  input_weight: number;
  input_weight_unit: WeightUnit;
  weight_kg: number;
  weight_lb: number;
  input_height_unit: HeightUnit;
  height_cm: number;
  age_years: number;
  gender: Gender;
  created_at: number;
  updated_at: number;
}

function mapMeasurement(row: BmiMeasurementRow): BmiMeasurement {
  return {
    id: row.id,
    profileId: row.profile_id,
    measuredAt: row.measured_at,
    localDate: row.local_date,
    timezoneOffsetMinutes: row.timezone_offset_minutes,
    inputWeight: row.input_weight,
    inputWeightUnit: row.input_weight_unit,
    weightKg: row.weight_kg,
    weightLb: row.weight_lb,
    inputHeightUnit: row.input_height_unit,
    heightCm: row.height_cm,
    ageYears: row.age_years,
    gender: row.gender,
    bmi: calculateBmi(row.weight_kg, row.height_cm),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function validate(input: BmiMeasurementInput): void {
  const error = firstBmiValidationError(validateBmiMeasurementInput(input));
  if (error) throw new Error(error);
}

export const bmiRepository = {
  async listAll(db: SQLiteDatabase, profileId: string): Promise<BmiMeasurement[]> {
    const rows = await db.getAllAsync<BmiMeasurementRow>(
      'SELECT * FROM bmi_measurements WHERE profile_id = ? ORDER BY measured_at DESC, created_at DESC',
      profileId,
    );
    return rows.map(mapMeasurement);
  },

  async getLatest(db: SQLiteDatabase, profileId: string): Promise<BmiMeasurement | null> {
    const row = await db.getFirstAsync<BmiMeasurementRow>(
      `SELECT * FROM bmi_measurements WHERE profile_id = ?
       ORDER BY measured_at DESC, created_at DESC LIMIT 1`,
      profileId,
    );
    return row ? mapMeasurement(row) : null;
  },

  async get(db: SQLiteDatabase, profileId: string, id: string): Promise<BmiMeasurement | null> {
    const row = await db.getFirstAsync<BmiMeasurementRow>(
      'SELECT * FROM bmi_measurements WHERE id = ? AND profile_id = ?',
      id,
      profileId,
    );
    return row ? mapMeasurement(row) : null;
  },

  async create(db: SQLiteDatabase, profile: Profile, draft: BmiMeasurementDraft): Promise<BmiMeasurement> {
    const input: BmiMeasurementInput = {
      ...draft,
      inputHeightUnit: profile.inputHeightUnit,
      heightCm: profile.heightCm,
      ageYears: profileAgeOnDate(profile, draft.measuredAt),
      gender: profile.gender,
    };
    validate(input);
    const now = Date.now();
    const measuredAt = input.measuredAt.getTime();
    const weight = convertWeight(input.inputWeight, input.inputWeightUnit);
    const measurement: BmiMeasurement = {
      id: randomUUID(),
      profileId: profile.id,
      measuredAt,
      localDate: toLocalDateKey(input.measuredAt),
      timezoneOffsetMinutes: input.measuredAt.getTimezoneOffset(),
      inputWeight: input.inputWeight,
      inputWeightUnit: input.inputWeightUnit,
      weightKg: weight.weightKg,
      weightLb: weight.weightLb,
      inputHeightUnit: input.inputHeightUnit,
      heightCm: input.heightCm,
      ageYears: input.ageYears,
      gender: input.gender,
      bmi: calculateBmi(weight.weightKg, input.heightCm),
      createdAt: now,
      updatedAt: now,
    };
    await db.runAsync(
      `INSERT INTO bmi_measurements
       (id, profile_id, measured_at, local_date, timezone_offset_minutes, input_weight, input_weight_unit,
        weight_kg, weight_lb, input_height_unit, height_cm, age_years, gender, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      measurement.id,
      measurement.profileId,
      measurement.measuredAt,
      measurement.localDate,
      measurement.timezoneOffsetMinutes,
      measurement.inputWeight,
      measurement.inputWeightUnit,
      measurement.weightKg,
      measurement.weightLb,
      measurement.inputHeightUnit,
      measurement.heightCm,
      measurement.ageYears,
      measurement.gender,
      measurement.createdAt,
      measurement.updatedAt,
    );
    return measurement;
  },

  async update(db: SQLiteDatabase, profileId: string, id: string, draft: BmiMeasurementDraft): Promise<void> {
    const current = await this.get(db, profileId, id);
    if (!current) throw new Error('Measurement not found.');
    const input: BmiMeasurementInput = {
      ...draft,
      inputHeightUnit: current.inputHeightUnit,
      heightCm: current.heightCm,
      ageYears: current.ageYears,
      gender: current.gender,
    };
    validate(input);
    const weight = convertWeight(input.inputWeight, input.inputWeightUnit);
    await db.runAsync(
      `UPDATE bmi_measurements SET measured_at = ?, local_date = ?, timezone_offset_minutes = ?,
       input_weight = ?, input_weight_unit = ?, weight_kg = ?, weight_lb = ?, updated_at = ?
       WHERE id = ? AND profile_id = ?`,
      input.measuredAt.getTime(),
      toLocalDateKey(input.measuredAt),
      input.measuredAt.getTimezoneOffset(),
      input.inputWeight,
      input.inputWeightUnit,
      weight.weightKg,
      weight.weightLb,
      Date.now(),
      id,
      profileId,
    );
  },

  async remove(db: SQLiteDatabase, profileId: string, id: string): Promise<void> {
    const result = await db.runAsync(
      'DELETE FROM bmi_measurements WHERE id = ? AND profile_id = ?',
      id,
      profileId,
    );
    if (result.changes === 0) throw new Error('Measurement not found.');
  },
};
