import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { Gender, HeightUnit } from '@/types/bmi';
import type { Profile, ProfileInput, ProfileOverview, ProfilePhoto } from '@/types/profile';
import { calculateBmi } from '@/utils/bmi';
import { normalizedProfileInput, validateProfileInput } from '@/utils/profiles';

interface ProfileRow {
  id: string;
  name: string;
  age_source: 'age' | 'dob';
  age_years: number | null;
  date_of_birth: string | null;
  gender: Gender;
  input_height_unit: HeightUnit;
  height_cm: number;
  photo_kind: ProfilePhoto['kind'];
  photo_ref: string | null;
  created_at: number;
  updated_at: number;
}

interface ProfileOverviewRow extends ProfileRow {
  session_count: number;
  exercise_count: number;
  set_count: number;
  bmi_measurement_count: number;
  latest_weight: number | null;
  latest_weight_unit: 'kg' | 'lb' | null;
  latest_weight_kg: number | null;
  latest_height_cm: number | null;
}

function mapPhoto(row: ProfileRow): ProfilePhoto {
  if (row.photo_kind === 'avatar' && row.photo_ref) return { kind: 'avatar', ref: row.photo_ref };
  if (row.photo_kind === 'local' && row.photo_ref) return { kind: 'local', ref: row.photo_ref };
  return { kind: 'none', ref: null };
}

function mapProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    name: row.name,
    ageSource: row.age_source,
    ageYears: row.age_years,
    dateOfBirth: row.date_of_birth,
    gender: row.gender,
    inputHeightUnit: row.input_height_unit,
    heightCm: row.height_cm,
    photo: mapPhoto(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function validate(input: ProfileInput): ProfileInput {
  const errors = validateProfileInput(input);
  const message = Object.values(errors)[0];
  if (message) throw new Error(message);
  return normalizedProfileInput(input);
}

const overviewSelect = `
  SELECT p.*,
    (SELECT COUNT(*) FROM sessions s WHERE s.profile_id = p.id) AS session_count,
    (SELECT COUNT(*) FROM session_exercises se
      JOIN sessions s ON s.id = se.session_id WHERE s.profile_id = p.id) AS exercise_count,
    (SELECT COUNT(*) FROM workout_sets ws
      JOIN session_exercises se ON se.id = ws.exercise_id
      JOIN sessions s ON s.id = se.session_id WHERE s.profile_id = p.id) AS set_count,
    (SELECT COUNT(*) FROM bmi_measurements bm WHERE bm.profile_id = p.id) AS bmi_measurement_count,
    (SELECT bm.input_weight FROM bmi_measurements bm WHERE bm.profile_id = p.id
      ORDER BY bm.measured_at DESC, bm.created_at DESC LIMIT 1) AS latest_weight,
    (SELECT bm.input_weight_unit FROM bmi_measurements bm WHERE bm.profile_id = p.id
      ORDER BY bm.measured_at DESC, bm.created_at DESC LIMIT 1) AS latest_weight_unit,
    (SELECT bm.weight_kg FROM bmi_measurements bm WHERE bm.profile_id = p.id
      ORDER BY bm.measured_at DESC, bm.created_at DESC LIMIT 1) AS latest_weight_kg,
    (SELECT bm.height_cm FROM bmi_measurements bm WHERE bm.profile_id = p.id
      ORDER BY bm.measured_at DESC, bm.created_at DESC LIMIT 1) AS latest_height_cm
  FROM profiles p
`;

export const profileRepository = {
  async list(db: SQLiteDatabase): Promise<Profile[]> {
    const rows = await db.getAllAsync<ProfileRow>(
      'SELECT * FROM profiles ORDER BY updated_at DESC, created_at DESC',
    );
    return rows.map(mapProfile);
  },

  async get(db: SQLiteDatabase, id: string): Promise<Profile | null> {
    const row = await db.getFirstAsync<ProfileRow>('SELECT * FROM profiles WHERE id = ?', id);
    return row ? mapProfile(row) : null;
  },

  async getSelected(db: SQLiteDatabase): Promise<Profile | null> {
    const row = await db.getFirstAsync<ProfileRow>(
      `SELECT p.* FROM profile_state ps JOIN profiles p ON p.id = ps.selected_profile_id
       WHERE ps.singleton = 1`,
    );
    return row ? mapProfile(row) : null;
  },

  async getOverview(db: SQLiteDatabase, id: string): Promise<ProfileOverview | null> {
    const row = await db.getFirstAsync<ProfileOverviewRow>(`${overviewSelect} WHERE p.id = ?`, id);
    if (!row) return null;
    return {
      ...mapProfile(row),
      sessionCount: row.session_count,
      exerciseCount: row.exercise_count,
      setCount: row.set_count,
      bmiMeasurementCount: row.bmi_measurement_count,
      latestBmi:
        row.latest_weight_kg && row.latest_height_cm
          ? calculateBmi(row.latest_weight_kg, row.latest_height_cm)
          : null,
      latestWeight: row.latest_weight,
      latestWeightUnit: row.latest_weight_unit,
    };
  },

  async create(db: SQLiteDatabase, input: ProfileInput): Promise<Profile> {
    const next = validate(input);
    const id = randomUUID();
    const now = Date.now();
    await db.withExclusiveTransactionAsync(async (transaction) => {
      const count = await transaction.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) AS count FROM profiles',
      );
      await transaction.runAsync(
        `INSERT INTO profiles
         (id, name, age_source, age_years, date_of_birth, gender, input_height_unit, height_cm,
          photo_kind, photo_ref, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        next.name,
        next.ageSource,
        next.ageYears,
        next.dateOfBirth,
        next.gender,
        next.inputHeightUnit,
        next.heightCm,
        next.photo.kind,
        next.photo.ref,
        now,
        now,
      );
      if ((count?.count ?? 0) === 0) {
        await transaction.runAsync(
          'UPDATE sessions SET profile_id = ? WHERE profile_id IS NULL',
          id,
        );
        await transaction.runAsync(
          'UPDATE bmi_measurements SET profile_id = ? WHERE profile_id IS NULL',
          id,
        );
      }
      await transaction.runAsync(
        `INSERT INTO profile_state (singleton, selected_profile_id) VALUES (1, ?)
         ON CONFLICT(singleton) DO UPDATE SET selected_profile_id = excluded.selected_profile_id`,
        id,
      );
    });
    const created = await this.get(db, id);
    if (!created) throw new Error('Profile creation failed.');
    return created;
  },

  async update(db: SQLiteDatabase, id: string, input: ProfileInput): Promise<void> {
    const next = validate(input);
    const result = await db.runAsync(
      `UPDATE profiles SET name = ?, age_source = ?, age_years = ?, date_of_birth = ?, gender = ?,
       input_height_unit = ?, height_cm = ?, photo_kind = ?, photo_ref = ?, updated_at = ? WHERE id = ?`,
      next.name,
      next.ageSource,
      next.ageYears,
      next.dateOfBirth,
      next.gender,
      next.inputHeightUnit,
      next.heightCm,
      next.photo.kind,
      next.photo.ref,
      Date.now(),
      id,
    );
    if (result.changes === 0) throw new Error('Profile not found.');
  },

  async select(db: SQLiteDatabase, id: string): Promise<void> {
    const exists = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM profiles WHERE id = ?',
      id,
    );
    if (!exists) throw new Error('Profile not found.');
    await db.runAsync(
      `INSERT INTO profile_state (singleton, selected_profile_id) VALUES (1, ?)
       ON CONFLICT(singleton) DO UPDATE SET selected_profile_id = excluded.selected_profile_id`,
      id,
    );
  },

  async remove(db: SQLiteDatabase, id: string): Promise<string | null> {
    let nextSelectedId: string | null = null;
    await db.withExclusiveTransactionAsync(async (transaction) => {
      const state = await transaction.getFirstAsync<{ selected_profile_id: string | null }>(
        'SELECT selected_profile_id FROM profile_state WHERE singleton = 1',
      );
      const result = await transaction.runAsync('DELETE FROM profiles WHERE id = ?', id);
      if (result.changes === 0) throw new Error('Profile not found.');
      if (state?.selected_profile_id === id) {
        const replacement = await transaction.getFirstAsync<{ id: string }>(
          'SELECT id FROM profiles ORDER BY updated_at DESC, created_at DESC LIMIT 1',
        );
        nextSelectedId = replacement?.id ?? null;
        await transaction.runAsync(
          'UPDATE profile_state SET selected_profile_id = ? WHERE singleton = 1',
          nextSelectedId,
        );
      } else {
        nextSelectedId = state?.selected_profile_id ?? null;
      }
    });
    return nextSelectedId;
  },
};
