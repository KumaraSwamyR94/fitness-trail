import { DatabaseSync } from 'node:sqlite';

import {
  MIGRATION_V2,
  MIGRATION_V3,
  MIGRATION_V4,
  MIGRATION_V5,
  MIGRATION_V6,
  SCHEMA_V1,
} from '@/data/migrations';
import { createTransferBundle, validateBundleRelationships } from '@/features/data-transfer/bundle';
import { createWorkoutCsv, parseTransferCsv } from '@/features/data-transfer/csv';
import { workoutRowsToData } from '@/features/data-transfer/csv-import';
import type { ParsedImportFile } from '@/features/data-transfer/file-codec';
import { applyImportPreview, createImportPreview } from '@/features/data-transfer/merge';
import type { TransferBundle } from '@/features/data-transfer/schemas';

let mockUuidCounter = 0;
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => `generated-${++mockUuidCounter}`) }));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '1.0.0' } },
}));

interface TestDatabase {
  getFirstAsync: (sql: string, ...params: unknown[]) => Promise<unknown>;
  getAllAsync: (sql: string, ...params: unknown[]) => Promise<unknown[]>;
  runAsync: (sql: string, ...params: unknown[]) => Promise<{ changes: number }>;
  execAsync: (sql: string) => Promise<void>;
  withExclusiveTransactionAsync: (
    callback: (transaction: TestDatabase) => Promise<void>,
  ) => Promise<void>;
}

function adapter(database: DatabaseSync, failInsertTable?: string): TestDatabase {
  const db: TestDatabase = {
    getFirstAsync: async (sql: string, ...params: unknown[]) =>
      database.prepare(sql).get(...(params as (string | number | null)[])) ?? null,
    getAllAsync: async (sql: string, ...params: unknown[]) =>
      database.prepare(sql).all(...(params as (string | number | null)[])),
    runAsync: async (sql: string, ...params: unknown[]) => {
      if (failInsertTable && sql.startsWith(`INSERT INTO ${failInsertTable}`)) {
        throw new Error(`Injected ${failInsertTable} failure`);
      }
      const result = database.prepare(sql).run(...(params as (string | number | null)[]));
      return { changes: Number(result.changes) };
    },
    execAsync: async (sql: string) => {
      database.exec(sql);
    },
    withExclusiveTransactionAsync: async (
      callback: (transaction: TestDatabase) => Promise<void>,
    ) => {
      database.exec('BEGIN EXCLUSIVE');
      try {
        await callback(db);
        database.exec('COMMIT');
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return db;
}

function createDatabase(): DatabaseSync {
  const database = new DatabaseSync(':memory:');
  database.exec('PRAGMA foreign_keys = ON');
  database.exec(
    `${SCHEMA_V1}\n${MIGRATION_V2}\n${MIGRATION_V3}\n${MIGRATION_V4}\n${MIGRATION_V5}\n${MIGRATION_V6}`,
  );
  return database;
}

const SESSION_TIME = Date.parse('2026-09-12T07:30:00.000Z');

function seedCompleteProfile(database: DatabaseSync): void {
  const createdAt = SESSION_TIME - 10_000;
  database.exec(`
    INSERT INTO profiles
      (id, name, age_source, age_years, date_of_birth, gender, input_height_unit,
       height_cm, photo_kind, photo_ref, created_at, updated_at)
    VALUES
      ('profile-1', 'Alex', 'age', 30, NULL, 'prefer_not_to_say', 'cm', 175,
       'local', 'private/profile.jpg', ${createdAt}, ${createdAt});
    UPDATE profile_state SET selected_profile_id = 'profile-1' WHERE singleton = 1;
    INSERT INTO muscle_group_catalog
      (id, normalized_name, display_name, is_predefined, use_count, last_used_at,
       created_at, updated_at)
    VALUES
      ('group-1', 'quadriceps custom', 'Quadriceps Custom', 0, 2, ${SESSION_TIME},
       ${createdAt}, ${createdAt});
    INSERT INTO exercise_catalog
      (id, normalized_name, display_name, use_count, last_used_at, created_at, updated_at,
       muscle_group_id, exercise_type)
    VALUES
      ('catalog-1', 'back squat', 'Back Squat', 2, ${SESSION_TIME}, ${createdAt},
       ${createdAt}, 'group-1', 'free_weight'),
      ('catalog-2', 'bike', 'Bike', 2, ${SESSION_TIME}, ${createdAt}, ${createdAt},
       NULL, 'cardio');
    INSERT INTO sessions
      (id, name, scheduled_at, local_date, timezone_offset_minutes, created_at, updated_at,
       profile_id)
    VALUES
      ('session-1', 'Mixed workout', ${SESSION_TIME}, '2026-09-12', -330,
       ${createdAt}, ${createdAt}, 'profile-1');
    INSERT INTO session_exercises
      (id, session_id, catalog_id, display_name, normalized_name, position, created_at,
       updated_at, muscle_group_id, exercise_type)
    VALUES
      ('exercise-1', 'session-1', 'catalog-1', 'Back Squat', 'back squat', 0,
       ${createdAt}, ${createdAt}, 'group-1', 'free_weight'),
      ('exercise-2', 'session-1', 'catalog-2', 'Bike', 'bike', 1,
       ${createdAt}, ${createdAt}, NULL, 'cardio');
    INSERT INTO workout_sets
      (id, exercise_id, position, set_kind, reps, input_weight, input_unit, weight_kg,
       weight_lb, tut_seconds, duration_seconds, calories, created_at, updated_at)
    VALUES
      ('set-1', 'exercise-1', 0, 'strength', 5, 80, 'kg', 80, 176.3696, 20,
       NULL, NULL, ${createdAt}, ${createdAt}),
      ('set-2', 'exercise-2', 0, 'duration', NULL, NULL, NULL, NULL, NULL, NULL,
       600, NULL, ${createdAt}, ${createdAt});
    INSERT INTO superset_templates (id, profile_id, name, created_at, updated_at)
    VALUES ('template-1', 'profile-1', 'Mixed pair', ${createdAt}, ${createdAt});
    INSERT INTO superset_template_members
      (id, template_id, catalog_id, display_name, normalized_name, muscle_group_id,
       exercise_type, position)
    VALUES
      ('template-member-1', 'template-1', 'catalog-1', 'Back Squat', 'back squat',
       'group-1', 'free_weight', 0),
      ('template-member-2', 'template-1', 'catalog-2', 'Bike', 'bike', NULL, 'cardio', 1);
    INSERT INTO supersets (id, session_id, template_id, name, created_at, updated_at)
    VALUES
      ('superset-1', 'session-1', 'template-1', 'Mixed pair', ${createdAt}, ${createdAt});
    INSERT INTO superset_members (superset_id, exercise_id, position, created_at)
    VALUES
      ('superset-1', 'exercise-1', 0, ${createdAt}),
      ('superset-1', 'exercise-2', 1, ${createdAt});
    INSERT INTO superset_rounds
      (id, superset_id, position, status, completed_at, created_at, updated_at)
    VALUES
      ('round-1', 'superset-1', 0, 'completed', ${SESSION_TIME}, ${createdAt},
       ${createdAt});
    INSERT INTO superset_round_entries
      (id, round_id, exercise_id, position, status, workout_set_id, created_at, updated_at)
    VALUES
      ('entry-1', 'round-1', 'exercise-1', 0, 'completed', 'set-1', ${createdAt},
       ${createdAt}),
      ('entry-2', 'round-1', 'exercise-2', 1, 'completed', 'set-2', ${createdAt},
       ${createdAt});
    INSERT INTO bmi_measurements
      (id, measured_at, local_date, timezone_offset_minutes, input_weight,
       input_weight_unit, weight_kg, weight_lb, input_height_unit, height_cm, age_years,
       gender, created_at, updated_at, profile_id)
    VALUES
      ('bmi-1', ${SESSION_TIME}, '2026-09-12', -330, 70, 'kg', 70, 154.3234,
       'cm', 175, 30, 'prefer_not_to_say', ${createdAt}, ${createdAt}, 'profile-1');
  `);
}

function parsedSource(bundle: TransferBundle): ParsedImportFile {
  return {
    bundle,
    format: 'json',
    generatedIds: [],
    issues: [],
    invalidRowCount: 0,
    invalidByDataset: { workouts: 0, bmi: 0 },
  };
}

async function exportSource(database: DatabaseSync): Promise<TransferBundle> {
  return createTransferBundle(adapter(database) as never, {
    profileIds: ['profile-1'],
    datasets: ['workouts', 'bmi'],
    format: 'fitness-trail-json',
    dateRange: null,
  });
}

describe('data transfer SQLite integration', () => {
  let source: DatabaseSync;
  let target: DatabaseSync;

  beforeEach(() => {
    mockUuidCounter = 0;
    source = createDatabase();
    target = createDatabase();
    seedCompleteProfile(source);
  });

  afterEach(() => {
    source.close();
    target.close();
  });

  test('restores a lossless backup into an empty database and reimports idempotently', async () => {
    const bundle = await exportSource(source);
    expect(validateBundleRelationships(bundle)).toEqual([]);

    const preview = await createImportPreview(
      adapter(target) as never,
      parsedSource(bundle),
      'backup.json',
    );
    expect(preview.profiles).toEqual([{ id: 'profile-1', name: 'Alex', action: 'create' }]);
    expect(preview.counts).toMatchObject({ additions: 19, conflicts: 0, invalid: 0 });

    const result = await applyImportPreview(adapter(target) as never, preview);
    expect(result).toMatchObject({ additions: 19, updates: 0, conflicts: 0, failed: 0 });
    expect(
      target.prepare('SELECT selected_profile_id FROM profile_state WHERE singleton = 1').get(),
    ).toEqual({ selected_profile_id: 'profile-1' });
    expect(
      target.prepare('SELECT photo_kind, photo_ref FROM profiles WHERE id = ?').get('profile-1'),
    ).toEqual({ photo_kind: 'none', photo_ref: null });
    expect(target.prepare('PRAGMA foreign_key_check').all()).toEqual([]);

    const secondPreview = await createImportPreview(
      adapter(target) as never,
      parsedSource(bundle),
      'backup.json',
    );
    expect(secondPreview.canImport).toBe(false);
    expect(secondPreview.counts).toMatchObject({ additions: 0, updates: 0, unchanged: 19 });
  });

  test('updates only newer stable records, preserves profile photos, and keeps local-only data', async () => {
    const bundle = await exportSource(source);
    const initial = await createImportPreview(
      adapter(target) as never,
      parsedSource(bundle),
      'backup.json',
    );
    await applyImportPreview(adapter(target) as never, initial);
    target.exec(`
      UPDATE profiles SET photo_kind = 'local', photo_ref = 'private/target.jpg'
      WHERE id = 'profile-1';
      INSERT INTO sessions
        (id, name, scheduled_at, local_date, timezone_offset_minutes, created_at, updated_at,
         profile_id)
      VALUES
        ('local-only', 'Local only', ${SESSION_TIME + 1000}, '2026-09-12', -330,
         ${SESSION_TIME}, ${SESSION_TIME}, 'profile-1');
    `);

    const newer = JSON.parse(JSON.stringify(bundle)) as TransferBundle;
    newer.profiles[0].name = 'Alex Updated';
    newer.profiles[0].updated_at += 20_000;
    newer.data.sessions[0].name = 'Updated workout';
    newer.data.sessions[0].updated_at += 20_000;
    const preview = await createImportPreview(
      adapter(target) as never,
      parsedSource(newer),
      'newer.json',
    );
    expect(preview.counts.updates).toBe(2);

    await applyImportPreview(adapter(target) as never, preview);
    expect(
      target
        .prepare('SELECT name, photo_kind, photo_ref FROM profiles WHERE id = ?')
        .get('profile-1'),
    ).toEqual({
      name: 'Alex Updated',
      photo_kind: 'local',
      photo_ref: 'private/target.jpg',
    });
    expect(target.prepare('SELECT name FROM sessions WHERE id = ?').get('session-1')).toEqual({
      name: 'Updated workout',
    });
    expect(
      target.prepare('SELECT COUNT(*) AS count FROM sessions WHERE id = ?').get('local-only'),
    ).toEqual({ count: 1 });
  });

  test('rolls back every write when a dependency insert fails', async () => {
    const bundle = await exportSource(source);
    const failing = adapter(target, 'workout_sets');
    const preview = await createImportPreview(
      failing as never,
      parsedSource(bundle),
      'backup.json',
    );

    await expect(applyImportPreview(failing as never, preview)).rejects.toThrow(
      'Injected workout_sets failure',
    );
    expect(target.prepare('SELECT COUNT(*) AS count FROM profiles').get()).toEqual({ count: 0 });
    expect(target.prepare('SELECT COUNT(*) AS count FROM sessions').get()).toEqual({ count: 0 });
    expect(target.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });

  test('treats differing no-ID natural-key rows as conflicts instead of overwriting', async () => {
    const bundle = await exportSource(source);
    const initial = await createImportPreview(
      adapter(target) as never,
      parsedSource(bundle),
      'backup.json',
    );
    await applyImportPreview(adapter(target) as never, initial);

    const csv = createWorkoutCsv(bundle, 'profile-1');
    const parsed = parseTransferCsv(csv);
    const rows = parsed.rows.map((row) => ({
      ...row,
      session_id: '',
      session_updated_at: '',
      exercise_id: '',
      exercise_updated_at: '',
      set_id: '',
      set_updated_at: '',
      weight: row.exercise_name === 'Back Squat' ? '85' : row.weight,
    }));
    const converted = workoutRowsToData(rows, bundle.profiles[0], 'manual.csv');
    const csvBundle = JSON.parse(JSON.stringify(bundle)) as TransferBundle;
    csvBundle.data = converted.data;
    csvBundle.selection = { datasets: ['workouts'], dateRange: null };
    const preview = await createImportPreview(
      adapter(target) as never,
      {
        bundle: csvBundle,
        format: 'csv',
        generatedIds: converted.generatedIds,
        issues: converted.issues,
        invalidRowCount: converted.invalidRowCount,
        invalidByDataset: { workouts: converted.invalidRowCount, bmi: 0 },
      },
      'manual.csv',
    );

    expect(preview.counts.conflicts).toBeGreaterThanOrEqual(1);
    expect(preview.counts.updates).toBe(0);
    expect(
      target.prepare('SELECT input_weight FROM workout_sets WHERE id = ?').get('set-1'),
    ).toEqual({ input_weight: 80 });
  });
});
