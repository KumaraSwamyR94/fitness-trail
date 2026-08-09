import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { ExerciseType, SetInput, SetKind, WeightUnit, WorkoutSet } from '@/types/workout';
import { convertWeight, validateSetInput } from '@/utils/weight';

interface SetRow {
  id: string;
  exercise_id: string;
  position: number;
  set_kind: SetKind;
  reps: number | null;
  input_weight: number | null;
  input_unit: WeightUnit | null;
  weight_kg: number | null;
  weight_lb: number | null;
  tut_seconds: number | null;
  duration_seconds: number | null;
  calories: number | null;
  created_at: number;
  updated_at: number;
}

function mapSet(row: SetRow): WorkoutSet {
  const base = {
    id: row.id,
    exerciseId: row.exercise_id,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (row.set_kind === 'duration' && row.duration_seconds !== null) {
    return { ...base, kind: 'duration', durationSeconds: row.duration_seconds };
  }
  if (row.set_kind === 'calories' && row.calories !== null) {
    return { ...base, kind: 'calories', calories: row.calories };
  }
  if (row.set_kind === 'strength' && row.reps !== null && row.input_unit && row.tut_seconds !== null) {
    return {
      ...base,
      kind: 'strength',
      reps: row.reps,
      inputWeight: row.input_weight,
      inputUnit: row.input_unit,
      weightKg: row.weight_kg,
      weightLb: row.weight_lb,
      tutSeconds: row.tut_seconds,
    };
  }
  throw new Error(`Set ${row.id} contains invalid ${row.set_kind} data.`);
}

async function assertCompatibleExercise(
  db: SQLiteDatabase,
  exerciseId: string,
  input: SetInput,
): Promise<ExerciseType> {
  const exercise = await db.getFirstAsync<{ exercise_type: ExerciseType }>(
    'SELECT exercise_type FROM session_exercises WHERE id = ?',
    exerciseId,
  );
  if (!exercise) throw new Error('Exercise not found.');
  const validation = validateSetInput(input, exercise.exercise_type);
  if (validation) throw new Error(validation);
  return exercise.exercise_type;
}

function databaseValues(input: SetInput) {
  if (input.kind === 'duration') {
    return [input.kind, null, null, null, null, null, null, input.durationSeconds, null] as const;
  }
  if (input.kind === 'calories') {
    return [input.kind, null, null, null, null, null, null, null, input.calories] as const;
  }
  const converted = input.inputWeight === null
    ? { weightKg: null, weightLb: null }
    : convertWeight(input.inputWeight, input.inputUnit);
  return [
    input.kind,
    input.reps,
    input.inputWeight,
    input.inputUnit,
    converted.weightKg,
    converted.weightLb,
    input.tutSeconds,
    null,
    null,
  ] as const;
}

async function compactPositions(db: SQLiteDatabase, exerciseId: string): Promise<void> {
  const rows = await db.getAllAsync<{ id: string }>(
    'SELECT id FROM workout_sets WHERE exercise_id = ? ORDER BY position, created_at',
    exerciseId,
  );
  await db.runAsync('UPDATE workout_sets SET position = -position - 1 WHERE exercise_id = ?', exerciseId);
  for (const [position, row] of rows.entries()) {
    await db.runAsync('UPDATE workout_sets SET position = ? WHERE id = ?', position, row.id);
  }
}

export const setRepository = {
  async listForExercise(db: SQLiteDatabase, exerciseId: string): Promise<WorkoutSet[]> {
    const rows = await db.getAllAsync<SetRow>(
      'SELECT * FROM workout_sets WHERE exercise_id = ? ORDER BY position',
      exerciseId,
    );
    return rows.map(mapSet);
  },

  async get(db: SQLiteDatabase, id: string): Promise<WorkoutSet | null> {
    const row = await db.getFirstAsync<SetRow>('SELECT * FROM workout_sets WHERE id = ?', id);
    return row ? mapSet(row) : null;
  },

  async create(db: SQLiteDatabase, exerciseId: string, input: SetInput): Promise<WorkoutSet> {
    await assertCompatibleExercise(db, exerciseId, input);
    const next = await db.getFirstAsync<{ next_position: number }>(
      'SELECT COALESCE(MAX(position), -1) + 1 AS next_position FROM workout_sets WHERE exercise_id = ?',
      exerciseId,
    );
    const id = randomUUID();
    const now = Date.now();
    const values = databaseValues(input);
    await db.runAsync(
      `INSERT INTO workout_sets
       (id, exercise_id, position, set_kind, reps, input_weight, input_unit, weight_kg,
        weight_lb, tut_seconds, duration_seconds, calories, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      exerciseId,
      next?.next_position ?? 0,
      ...values,
      now,
      now,
    );
    const row = await db.getFirstAsync<SetRow>('SELECT * FROM workout_sets WHERE id = ?', id);
    const created = row ? mapSet(row) : null;
    if (!created) throw new Error('Set creation failed.');
    return created;
  },

  async update(db: SQLiteDatabase, id: string, input: SetInput): Promise<void> {
    const current = await db.getFirstAsync<{ exercise_id: string }>(
      'SELECT exercise_id FROM workout_sets WHERE id = ?',
      id,
    );
    if (!current) throw new Error('Set not found.');
    await assertCompatibleExercise(db, current.exercise_id, input);
    const values = databaseValues(input);
    await db.runAsync(
      `UPDATE workout_sets SET set_kind = ?, reps = ?, input_weight = ?, input_unit = ?,
       weight_kg = ?, weight_lb = ?, tut_seconds = ?, duration_seconds = ?, calories = ?,
       updated_at = ? WHERE id = ?`,
      ...values,
      Date.now(),
      id,
    );
  },

  async remove(db: SQLiteDatabase, id: string, exerciseId: string): Promise<void> {
    await db.withExclusiveTransactionAsync(async (transaction) => {
      await transaction.runAsync('DELETE FROM workout_sets WHERE id = ?', id);
      await compactPositions(transaction, exerciseId);
    });
  },
};
