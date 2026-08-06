import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { SetInput, WorkoutSet } from '@/types/workout';
import { convertWeight } from '@/utils/weight';

interface SetRow {
  id: string;
  exercise_id: string;
  position: number;
  reps: number;
  input_weight: number;
  input_unit: 'kg' | 'lb';
  weight_kg: number;
  weight_lb: number;
  tut_seconds: number;
  created_at: number;
  updated_at: number;
}

function mapSet(row: SetRow): WorkoutSet {
  return {
    id: row.id,
    exerciseId: row.exercise_id,
    position: row.position,
    reps: row.reps,
    inputWeight: row.input_weight,
    inputUnit: row.input_unit,
    weightKg: row.weight_kg,
    weightLb: row.weight_lb,
    tutSeconds: row.tut_seconds,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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
    const converted = convertWeight(input.inputWeight, input.inputUnit);
    const next = await db.getFirstAsync<{ next_position: number }>(
      'SELECT COALESCE(MAX(position), -1) + 1 AS next_position FROM workout_sets WHERE exercise_id = ?',
      exerciseId,
    );
    const now = Date.now();
    const workoutSet: WorkoutSet = {
      id: randomUUID(),
      exerciseId,
      position: next?.next_position ?? 0,
      ...input,
      ...converted,
      createdAt: now,
      updatedAt: now,
    };
    await db.runAsync(
      `INSERT INTO workout_sets
       (id, exercise_id, position, reps, input_weight, input_unit, weight_kg,
        weight_lb, tut_seconds, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      workoutSet.id,
      workoutSet.exerciseId,
      workoutSet.position,
      workoutSet.reps,
      workoutSet.inputWeight,
      workoutSet.inputUnit,
      workoutSet.weightKg,
      workoutSet.weightLb,
      workoutSet.tutSeconds,
      workoutSet.createdAt,
      workoutSet.updatedAt,
    );
    return workoutSet;
  },

  async update(db: SQLiteDatabase, id: string, input: SetInput): Promise<void> {
    const converted = convertWeight(input.inputWeight, input.inputUnit);
    await db.runAsync(
      `UPDATE workout_sets SET reps = ?, input_weight = ?, input_unit = ?,
       weight_kg = ?, weight_lb = ?, tut_seconds = ?, updated_at = ? WHERE id = ?`,
      input.reps,
      input.inputWeight,
      input.inputUnit,
      converted.weightKg,
      converted.weightLb,
      input.tutSeconds,
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
