import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import type {
  ExerciseType,
  PreviousExerciseWorkout,
  SetInput,
  SetKind,
  WeightUnit,
  WorkoutSet,
} from '@/types/workout';
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

interface PreviousWorkoutRow {
  session_id: string;
  session_name: string;
  scheduled_at: number;
  exercise_id: string;
  exercise_name: string;
  exercise_type: ExerciseType;
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
  if (
    row.set_kind === 'strength' &&
    row.reps !== null &&
    row.input_unit &&
    row.tut_seconds !== null
  ) {
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

async function getOwnedExerciseType(
  db: SQLiteDatabase,
  profileId: string,
  exerciseId: string,
): Promise<ExerciseType> {
  const exercise = await db.getFirstAsync<{ exercise_type: ExerciseType }>(
    `SELECT se.exercise_type FROM session_exercises se
     JOIN sessions s ON s.id = se.session_id
     WHERE se.id = ? AND s.profile_id = ?`,
    exerciseId,
    profileId,
  );
  if (!exercise) throw new Error('Exercise not found.');
  return exercise.exercise_type;
}

async function assertCompatibleExercise(
  db: SQLiteDatabase,
  profileId: string,
  exerciseId: string,
  input: SetInput,
): Promise<ExerciseType> {
  const exerciseType = await getOwnedExerciseType(db, profileId, exerciseId);
  const validation = validateSetInput(input, exerciseType);
  if (validation) throw new Error(validation);
  return exerciseType;
}

function databaseValues(input: SetInput) {
  if (input.kind === 'duration') {
    return [input.kind, null, null, null, null, null, null, input.durationSeconds, null] as const;
  }
  if (input.kind === 'calories') {
    return [input.kind, null, null, null, null, null, null, null, input.calories] as const;
  }
  const converted =
    input.inputWeight === null
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
  await db.runAsync(
    'UPDATE workout_sets SET position = -position - 1 WHERE exercise_id = ?',
    exerciseId,
  );
  for (const [position, row] of rows.entries()) {
    await db.runAsync('UPDATE workout_sets SET position = ? WHERE id = ?', position, row.id);
  }
}

export const setRepository = {
  async listForExercise(
    db: SQLiteDatabase,
    profileId: string,
    exerciseId: string,
  ): Promise<WorkoutSet[]> {
    const rows = await db.getAllAsync<SetRow>(
      `SELECT ws.* FROM workout_sets ws
       JOIN session_exercises se ON se.id = ws.exercise_id
       JOIN sessions s ON s.id = se.session_id
       WHERE ws.exercise_id = ? AND s.profile_id = ? ORDER BY ws.position`,
      exerciseId,
      profileId,
    );
    return rows.map(mapSet);
  },

  async getPreviousWorkout(
    db: SQLiteDatabase,
    profileId: string,
    exerciseId: string,
  ): Promise<PreviousExerciseWorkout | null> {
    const previous = await db.getFirstAsync<PreviousWorkoutRow>(
      `WITH current_exercise AS (
         SELECT se.id, se.session_id, se.catalog_id, se.normalized_name, se.exercise_type,
                s.scheduled_at, s.created_at
         FROM session_exercises se
         JOIN sessions s ON s.id = se.session_id
         WHERE se.id = ? AND s.profile_id = ?
       )
       SELECT previous_session.id AS session_id,
              previous_session.name AS session_name,
              previous_session.scheduled_at,
              previous_exercise.id AS exercise_id,
              previous_exercise.display_name AS exercise_name,
              previous_exercise.exercise_type
       FROM current_exercise current
       JOIN session_exercises previous_exercise ON (
         (current.catalog_id IS NOT NULL AND previous_exercise.catalog_id = current.catalog_id)
         OR
         ((current.catalog_id IS NULL OR previous_exercise.catalog_id IS NULL)
           AND previous_exercise.normalized_name = current.normalized_name
           AND previous_exercise.exercise_type = current.exercise_type)
       )
       JOIN sessions previous_session ON previous_session.id = previous_exercise.session_id
       WHERE previous_session.profile_id = ?
         AND previous_session.id <> current.session_id
         AND (
           previous_session.scheduled_at < current.scheduled_at
           OR (
             previous_session.scheduled_at = current.scheduled_at
             AND previous_session.created_at < current.created_at
           )
         )
         AND EXISTS (
           SELECT 1 FROM workout_sets
           WHERE workout_sets.exercise_id = previous_exercise.id
         )
       ORDER BY previous_session.scheduled_at DESC, previous_session.created_at DESC
       LIMIT 1`,
      exerciseId,
      profileId,
      profileId,
    );
    if (!previous) return null;

    const rows = await db.getAllAsync<SetRow>(
      `SELECT ws.* FROM workout_sets ws
       JOIN session_exercises se ON se.id = ws.exercise_id
       JOIN sessions s ON s.id = se.session_id
       WHERE ws.exercise_id = ? AND s.profile_id = ?
       ORDER BY ws.position`,
      previous.exercise_id,
      profileId,
    );
    return {
      sessionId: previous.session_id,
      sessionName: previous.session_name,
      scheduledAt: previous.scheduled_at,
      exerciseId: previous.exercise_id,
      exerciseName: previous.exercise_name,
      exerciseType: previous.exercise_type,
      sets: rows.map(mapSet),
    };
  },

  async get(db: SQLiteDatabase, profileId: string, id: string): Promise<WorkoutSet | null> {
    const row = await db.getFirstAsync<SetRow>(
      `SELECT ws.* FROM workout_sets ws
       JOIN session_exercises se ON se.id = ws.exercise_id
       JOIN sessions s ON s.id = se.session_id
       WHERE ws.id = ? AND s.profile_id = ?`,
      id,
      profileId,
    );
    return row ? mapSet(row) : null;
  },

  async create(
    db: SQLiteDatabase,
    profileId: string,
    exerciseId: string,
    input: SetInput,
  ): Promise<WorkoutSet> {
    await assertCompatibleExercise(db, profileId, exerciseId, input);
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

  async update(db: SQLiteDatabase, profileId: string, id: string, input: SetInput): Promise<void> {
    const current = await db.getFirstAsync<{ exercise_id: string }>(
      `SELECT ws.exercise_id FROM workout_sets ws
       JOIN session_exercises se ON se.id = ws.exercise_id
       JOIN sessions s ON s.id = se.session_id
       WHERE ws.id = ? AND s.profile_id = ?`,
      id,
      profileId,
    );
    if (!current) throw new Error('Set not found.');
    await assertCompatibleExercise(db, profileId, current.exercise_id, input);
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

  async remove(
    db: SQLiteDatabase,
    profileId: string,
    id: string,
    exerciseId: string,
  ): Promise<void> {
    await db.withExclusiveTransactionAsync(async (transaction) => {
      await getOwnedExerciseType(transaction, profileId, exerciseId);
      const result = await transaction.runAsync(
        'DELETE FROM workout_sets WHERE id = ? AND exercise_id = ?',
        id,
        exerciseId,
      );
      if (result.changes === 0) throw new Error('Set not found.');
      await compactPositions(transaction, exerciseId);
    });
  },
};
