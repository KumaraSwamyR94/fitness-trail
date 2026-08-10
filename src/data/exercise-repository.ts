import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { DataConflictError } from '@/data/errors';
import { upsertMuscleGroup } from '@/data/muscle-group-repository';
import type {
  ExerciseCatalogEntry,
  ExerciseSummary,
  ExerciseType,
  SessionExercise,
  SetKind,
  WeightUnit,
  WorkoutSetSummary,
} from '@/types/workout';
import { cleanDisplayName, normalizeName } from '@/utils/names';

interface ExerciseRow {
  id: string;
  session_id: string;
  catalog_id: string | null;
  display_name: string;
  normalized_name: string;
  muscle_group_id: string | null;
  muscle_group_name: string | null;
  exercise_type: ExerciseType;
  position: number;
  created_at: number;
  updated_at: number;
}

interface ExerciseSummaryRow extends ExerciseRow {
  set_count: number;
  last_set_kind: SetKind | null;
  last_reps: number | null;
  last_input_weight: number | null;
  last_weight_kg: number | null;
  last_weight_lb: number | null;
  last_input_unit: WeightUnit | null;
  last_tut_seconds: number | null;
  last_duration_seconds: number | null;
  last_calories: number | null;
}

interface CatalogRow {
  id: string;
  normalized_name: string;
  display_name: string;
  muscle_group_id: string | null;
  muscle_group_name: string | null;
  exercise_type: ExerciseType;
  use_count: number;
  last_used_at: number;
}

function mapExercise(row: ExerciseRow): SessionExercise {
  return {
    id: row.id,
    sessionId: row.session_id,
    catalogId: row.catalog_id,
    displayName: row.display_name,
    normalizedName: row.normalized_name,
    muscleGroupId: row.muscle_group_id,
    muscleGroupName: row.muscle_group_name,
    exerciseType: row.exercise_type,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSummary(row: ExerciseSummaryRow): ExerciseSummary {
  return {
    ...mapExercise(row),
    setCount: row.set_count,
    lastSet: mapLastSet(row),
  };
}

function mapLastSet(row: ExerciseSummaryRow): WorkoutSetSummary | null {
  if (row.last_set_kind === 'duration' && row.last_duration_seconds !== null) {
    return { kind: 'duration', durationSeconds: row.last_duration_seconds };
  }
  if (row.last_set_kind === 'calories' && row.last_calories !== null) {
    return { kind: 'calories', calories: row.last_calories };
  }
  if (row.last_set_kind === 'strength' && row.last_reps !== null && row.last_input_unit) {
    return {
      kind: 'strength',
      reps: row.last_reps,
      inputWeight: row.last_input_weight,
      inputUnit: row.last_input_unit,
      weightKg: row.last_weight_kg,
      weightLb: row.last_weight_lb,
      tutSeconds: row.last_tut_seconds ?? 0,
    };
  }
  return null;
}

function mapCatalog(row: CatalogRow): ExerciseCatalogEntry {
  return {
    id: row.id,
    normalizedName: row.normalized_name,
    displayName: row.display_name,
    muscleGroupId: row.muscle_group_id,
    muscleGroupName: row.muscle_group_name,
    exerciseType: row.exercise_type,
    useCount: row.use_count,
    lastUsedAt: row.last_used_at,
  };
}

async function upsertCatalog(
  db: SQLiteDatabase,
  displayName: string,
  normalizedName: string,
  muscleGroupId: string | null,
  exerciseType: ExerciseType,
): Promise<string> {
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO exercise_catalog
      (id, normalized_name, display_name, use_count, last_used_at, created_at, updated_at, muscle_group_id, exercise_type)
     VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)
     ON CONFLICT(normalized_name) DO UPDATE SET
       display_name = excluded.display_name,
       muscle_group_id = excluded.muscle_group_id,
       exercise_type = excluded.exercise_type,
       use_count = exercise_catalog.use_count + 1,
       last_used_at = excluded.last_used_at,
       updated_at = excluded.updated_at`,
    randomUUID(),
    normalizedName,
    displayName,
    now,
    now,
    now,
    muscleGroupId,
    exerciseType,
  );
  const row = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM exercise_catalog WHERE normalized_name = ?',
    normalizedName,
  );
  if (!row) throw new Error('Exercise catalog update failed.');
  return row.id;
}

async function compactPositions(db: SQLiteDatabase, sessionId: string): Promise<void> {
  const rows = await db.getAllAsync<{ id: string }>(
    'SELECT id FROM session_exercises WHERE session_id = ? ORDER BY position, created_at',
    sessionId,
  );
  await db.runAsync(
    'UPDATE session_exercises SET position = -position - 1 WHERE session_id = ?',
    sessionId,
  );
  for (const [position, row] of rows.entries()) {
    await db.runAsync('UPDATE session_exercises SET position = ? WHERE id = ?', position, row.id);
  }
}

async function assertSessionOwned(
  db: SQLiteDatabase,
  profileId: string,
  sessionId: string,
): Promise<void> {
  const session = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM sessions WHERE id = ? AND profile_id = ?',
    sessionId,
    profileId,
  );
  if (!session) throw new Error('Session not found.');
}

export const exerciseRepository = {
  async listForSession(
    db: SQLiteDatabase,
    profileId: string,
    sessionId: string,
  ): Promise<ExerciseSummary[]> {
    const rows = await db.getAllAsync<ExerciseSummaryRow>(
      `SELECT se.*, mg.display_name AS muscle_group_name,
        COUNT(ws.id) AS set_count,
        last_ws.set_kind AS last_set_kind,
        last_ws.reps AS last_reps,
        last_ws.input_weight AS last_input_weight,
        last_ws.weight_kg AS last_weight_kg,
        last_ws.weight_lb AS last_weight_lb,
        last_ws.input_unit AS last_input_unit,
        last_ws.tut_seconds AS last_tut_seconds,
        last_ws.duration_seconds AS last_duration_seconds,
        last_ws.calories AS last_calories
       FROM session_exercises se
       JOIN sessions s ON s.id = se.session_id
       LEFT JOIN muscle_group_catalog mg ON mg.id = se.muscle_group_id
       LEFT JOIN workout_sets ws ON ws.exercise_id = se.id
       LEFT JOIN workout_sets last_ws ON last_ws.id = (
         SELECT id FROM workout_sets WHERE exercise_id = se.id ORDER BY position DESC LIMIT 1
       )
       WHERE se.session_id = ? AND s.profile_id = ?
       GROUP BY se.id
       ORDER BY se.position`,
      sessionId,
      profileId,
    );
    return rows.map(mapSummary);
  },

  async get(db: SQLiteDatabase, profileId: string, id: string): Promise<SessionExercise | null> {
    const row = await db.getFirstAsync<ExerciseRow>(
      `SELECT se.*, mg.display_name AS muscle_group_name
       FROM session_exercises se
       JOIN sessions s ON s.id = se.session_id
       LEFT JOIN muscle_group_catalog mg ON mg.id = se.muscle_group_id
       WHERE se.id = ? AND s.profile_id = ?`,
      id,
      profileId,
    );
    return row ? mapExercise(row) : null;
  },

  async searchCatalog(
    db: SQLiteDatabase,
    query: string,
    limit = 20,
  ): Promise<ExerciseCatalogEntry[]> {
    const normalized = normalizeName(query);
    const rows = await db.getAllAsync<CatalogRow>(
      `SELECT ec.id, ec.normalized_name, ec.display_name, ec.use_count, ec.last_used_at, ec.exercise_type,
              ec.muscle_group_id, mg.display_name AS muscle_group_name
       FROM exercise_catalog ec
       LEFT JOIN muscle_group_catalog mg ON mg.id = ec.muscle_group_id
       WHERE ? = '' OR instr(ec.normalized_name, ?) > 0
       ORDER BY CASE WHEN instr(ec.normalized_name, ?) = 1 THEN 0 ELSE 1 END,
                ec.last_used_at DESC, ec.display_name COLLATE NOCASE
       LIMIT ?`,
      normalized,
      normalized,
      normalized,
      limit,
    );
    return rows.map(mapCatalog);
  },

  async create(
    db: SQLiteDatabase,
    profileId: string,
    sessionId: string,
    name: string,
    muscleGroupName: string,
    exerciseType: ExerciseType,
  ): Promise<SessionExercise> {
    if (exerciseType !== 'cardio' && !muscleGroupName.trim()) {
      throw new Error('Choose or enter a muscle group.');
    }
    const displayName = cleanDisplayName(name);
    const normalizedName = normalizeName(name);
    let created: SessionExercise | null = null;
    await db.withExclusiveTransactionAsync(async (transaction) => {
      await assertSessionOwned(transaction, profileId, sessionId);
      const duplicate = await transaction.getFirstAsync<{ id: string }>(
        'SELECT id FROM session_exercises WHERE session_id = ? AND normalized_name = ?',
        sessionId,
        normalizedName,
      );
      if (duplicate) throw new DataConflictError('This exercise is already in the session.');
      const muscleGroup = muscleGroupName.trim()
        ? await upsertMuscleGroup(transaction, muscleGroupName)
        : null;
      const catalogId = await upsertCatalog(
        transaction,
        displayName,
        normalizedName,
        muscleGroup?.id ?? null,
        exerciseType,
      );
      const positionRow = await transaction.getFirstAsync<{ next_position: number }>(
        'SELECT COALESCE(MAX(position), -1) + 1 AS next_position FROM session_exercises WHERE session_id = ?',
        sessionId,
      );
      const now = Date.now();
      created = {
        id: randomUUID(),
        sessionId,
        catalogId,
        displayName,
        normalizedName,
        muscleGroupId: muscleGroup?.id ?? null,
        muscleGroupName: muscleGroup?.displayName ?? null,
        exerciseType,
        position: positionRow?.next_position ?? 0,
        createdAt: now,
        updatedAt: now,
      };
      await transaction.runAsync(
        `INSERT INTO session_exercises
         (id, session_id, catalog_id, display_name, normalized_name, muscle_group_id, exercise_type, position, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        created.id,
        created.sessionId,
        created.catalogId,
        created.displayName,
        created.normalizedName,
        created.muscleGroupId,
        created.exerciseType,
        created.position,
        created.createdAt,
        created.updatedAt,
      );
    });
    if (!created) throw new Error('Exercise creation failed.');
    return created;
  },

  async rename(
    db: SQLiteDatabase,
    profileId: string,
    id: string,
    sessionId: string,
    name: string,
  ): Promise<void> {
    const displayName = cleanDisplayName(name);
    const normalizedName = normalizeName(name);
    await db.withExclusiveTransactionAsync(async (transaction) => {
      await assertSessionOwned(transaction, profileId, sessionId);
      const duplicate = await transaction.getFirstAsync<{ id: string }>(
        `SELECT id FROM session_exercises
         WHERE session_id = ? AND normalized_name = ? AND id <> ?`,
        sessionId,
        normalizedName,
        id,
      );
      if (duplicate) throw new DataConflictError('This exercise is already in the session.');
      const current = await transaction.getFirstAsync<{
        muscle_group_id: string | null;
        exercise_type: ExerciseType;
      }>(
        `SELECT se.muscle_group_id, se.exercise_type FROM session_exercises se
         JOIN sessions s ON s.id = se.session_id
         WHERE se.id = ? AND se.session_id = ? AND s.profile_id = ?`,
        id,
        sessionId,
        profileId,
      );
      if (!current) throw new Error('Exercise not found.');
      const catalogId = await upsertCatalog(
        transaction,
        displayName,
        normalizedName,
        current?.muscle_group_id ?? null,
        current?.exercise_type ?? 'free_weight',
      );
      await transaction.runAsync(
        `UPDATE session_exercises SET catalog_id = ?, display_name = ?,
         normalized_name = ?, updated_at = ? WHERE id = ?`,
        catalogId,
        displayName,
        normalizedName,
        Date.now(),
        id,
      );
    });
  },

  async remove(
    db: SQLiteDatabase,
    profileId: string,
    id: string,
    sessionId: string,
  ): Promise<void> {
    await db.withExclusiveTransactionAsync(async (transaction) => {
      await assertSessionOwned(transaction, profileId, sessionId);
      const result = await transaction.runAsync(
        'DELETE FROM session_exercises WHERE id = ? AND session_id = ?',
        id,
        sessionId,
      );
      if (result.changes === 0) throw new Error('Exercise not found.');
      await compactPositions(transaction, sessionId);
    });
  },

  async reorder(
    db: SQLiteDatabase,
    profileId: string,
    sessionId: string,
    orderedIds: string[],
  ): Promise<void> {
    await db.withExclusiveTransactionAsync(async (transaction) => {
      await assertSessionOwned(transaction, profileId, sessionId);
      await transaction.runAsync(
        'UPDATE session_exercises SET position = -position - 1 WHERE session_id = ?',
        sessionId,
      );
      for (const [position, id] of orderedIds.entries()) {
        await transaction.runAsync(
          'UPDATE session_exercises SET position = ?, updated_at = ? WHERE id = ? AND session_id = ?',
          position,
          Date.now(),
          id,
          sessionId,
        );
      }
    });
  },
};
