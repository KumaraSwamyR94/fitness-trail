import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { DataConflictError } from '@/data/errors';
import { upsertMuscleGroup } from '@/data/muscle-group-repository';
import type {
  ExerciseCatalogEntry,
  ExerciseSummary,
  SessionExercise,
  WeightUnit,
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
  position: number;
  created_at: number;
  updated_at: number;
}

interface ExerciseSummaryRow extends ExerciseRow {
  set_count: number;
  last_reps: number | null;
  last_weight_kg: number | null;
  last_weight_lb: number | null;
  last_input_unit: WeightUnit | null;
}

interface CatalogRow {
  id: string;
  normalized_name: string;
  display_name: string;
  muscle_group_id: string | null;
  muscle_group_name: string | null;
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
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSummary(row: ExerciseSummaryRow): ExerciseSummary {
  return {
    ...mapExercise(row),
    setCount: row.set_count,
    lastReps: row.last_reps,
    lastWeightKg: row.last_weight_kg,
    lastWeightLb: row.last_weight_lb,
    lastInputUnit: row.last_input_unit,
  };
}

function mapCatalog(row: CatalogRow): ExerciseCatalogEntry {
  return {
    id: row.id,
    normalizedName: row.normalized_name,
    displayName: row.display_name,
    muscleGroupId: row.muscle_group_id,
    muscleGroupName: row.muscle_group_name,
    useCount: row.use_count,
    lastUsedAt: row.last_used_at,
  };
}

async function upsertCatalog(
  db: SQLiteDatabase,
  displayName: string,
  normalizedName: string,
  muscleGroupId: string | null,
): Promise<string> {
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO exercise_catalog
      (id, normalized_name, display_name, use_count, last_used_at, created_at, updated_at, muscle_group_id)
     VALUES (?, ?, ?, 1, ?, ?, ?, ?)
     ON CONFLICT(normalized_name) DO UPDATE SET
       display_name = excluded.display_name,
       muscle_group_id = COALESCE(excluded.muscle_group_id, exercise_catalog.muscle_group_id),
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

export const exerciseRepository = {
  async listForSession(db: SQLiteDatabase, sessionId: string): Promise<ExerciseSummary[]> {
    const rows = await db.getAllAsync<ExerciseSummaryRow>(
      `SELECT se.*, mg.display_name AS muscle_group_name,
        COUNT(ws.id) AS set_count,
        (SELECT reps FROM workout_sets WHERE exercise_id = se.id ORDER BY position DESC LIMIT 1) AS last_reps,
        (SELECT weight_kg FROM workout_sets WHERE exercise_id = se.id ORDER BY position DESC LIMIT 1) AS last_weight_kg,
        (SELECT weight_lb FROM workout_sets WHERE exercise_id = se.id ORDER BY position DESC LIMIT 1) AS last_weight_lb,
        (SELECT input_unit FROM workout_sets WHERE exercise_id = se.id ORDER BY position DESC LIMIT 1) AS last_input_unit
       FROM session_exercises se
       LEFT JOIN muscle_group_catalog mg ON mg.id = se.muscle_group_id
       LEFT JOIN workout_sets ws ON ws.exercise_id = se.id
       WHERE se.session_id = ?
       GROUP BY se.id
       ORDER BY se.position`,
      sessionId,
    );
    return rows.map(mapSummary);
  },

  async get(db: SQLiteDatabase, id: string): Promise<SessionExercise | null> {
    const row = await db.getFirstAsync<ExerciseRow>(
      `SELECT se.*, mg.display_name AS muscle_group_name
       FROM session_exercises se
       LEFT JOIN muscle_group_catalog mg ON mg.id = se.muscle_group_id
       WHERE se.id = ?`,
      id,
    );
    return row ? mapExercise(row) : null;
  },

  async searchCatalog(db: SQLiteDatabase, query: string, limit = 20): Promise<ExerciseCatalogEntry[]> {
    const normalized = normalizeName(query);
    const rows = await db.getAllAsync<CatalogRow>(
      `SELECT ec.id, ec.normalized_name, ec.display_name, ec.use_count, ec.last_used_at,
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
    sessionId: string,
    name: string,
    muscleGroupName: string,
  ): Promise<SessionExercise> {
    const displayName = cleanDisplayName(name);
    const normalizedName = normalizeName(name);
    let created: SessionExercise | null = null;
    await db.withExclusiveTransactionAsync(async (transaction) => {
      const duplicate = await transaction.getFirstAsync<{ id: string }>(
        'SELECT id FROM session_exercises WHERE session_id = ? AND normalized_name = ?',
        sessionId,
        normalizedName,
      );
      if (duplicate) throw new DataConflictError('This exercise is already in the session.');
      const muscleGroup = await upsertMuscleGroup(transaction, muscleGroupName);
      const catalogId = await upsertCatalog(
        transaction,
        displayName,
        normalizedName,
        muscleGroup.id,
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
        muscleGroupId: muscleGroup.id,
        muscleGroupName: muscleGroup.displayName,
        position: positionRow?.next_position ?? 0,
        createdAt: now,
        updatedAt: now,
      };
      await transaction.runAsync(
        `INSERT INTO session_exercises
         (id, session_id, catalog_id, display_name, normalized_name, muscle_group_id, position, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        created.id,
        created.sessionId,
        created.catalogId,
        created.displayName,
        created.normalizedName,
        created.muscleGroupId,
        created.position,
        created.createdAt,
        created.updatedAt,
      );
    });
    if (!created) throw new Error('Exercise creation failed.');
    return created;
  },

  async rename(db: SQLiteDatabase, id: string, sessionId: string, name: string): Promise<void> {
    const displayName = cleanDisplayName(name);
    const normalizedName = normalizeName(name);
    await db.withExclusiveTransactionAsync(async (transaction) => {
      const duplicate = await transaction.getFirstAsync<{ id: string }>(
        `SELECT id FROM session_exercises
         WHERE session_id = ? AND normalized_name = ? AND id <> ?`,
        sessionId,
        normalizedName,
        id,
      );
      if (duplicate) throw new DataConflictError('This exercise is already in the session.');
      const current = await transaction.getFirstAsync<{ muscle_group_id: string | null }>(
        'SELECT muscle_group_id FROM session_exercises WHERE id = ?',
        id,
      );
      const catalogId = await upsertCatalog(
        transaction,
        displayName,
        normalizedName,
        current?.muscle_group_id ?? null,
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

  async remove(db: SQLiteDatabase, id: string, sessionId: string): Promise<void> {
    await db.withExclusiveTransactionAsync(async (transaction) => {
      await transaction.runAsync('DELETE FROM session_exercises WHERE id = ?', id);
      await compactPositions(transaction, sessionId);
    });
  },

  async reorder(db: SQLiteDatabase, sessionId: string, orderedIds: string[]): Promise<void> {
    await db.withExclusiveTransactionAsync(async (transaction) => {
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
