import { DatabaseSync } from 'node:sqlite';

import {
  MIGRATION_V2,
  MIGRATION_V3,
  MIGRATION_V4,
  MIGRATION_V5,
  MIGRATION_V6,
  SCHEMA_V1,
} from '@/data/migrations';
import { setRepository } from '@/data/set-repository';
import { supersetRepository } from '@/data/superset-repository';

let mockUuidCounter = 0;
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => `generated-${++mockUuidCounter}`) }));

interface TestDatabase {
  getFirstAsync: (sql: string, ...params: unknown[]) => Promise<unknown>;
  getAllAsync: (sql: string, ...params: unknown[]) => Promise<unknown[]>;
  runAsync: (sql: string, ...params: unknown[]) => Promise<{ changes: number }>;
  execAsync: (sql: string) => Promise<void>;
  withExclusiveTransactionAsync: (
    callback: (transaction: TestDatabase) => Promise<void>,
  ) => Promise<void>;
}

function adapter(database: DatabaseSync): TestDatabase {
  const db: TestDatabase = {
    getFirstAsync: async (sql: string, ...params: unknown[]) =>
      database.prepare(sql).get(...(params as (string | number | null)[])) ?? null,
    getAllAsync: async (sql: string, ...params: unknown[]) =>
      database.prepare(sql).all(...(params as (string | number | null)[])),
    runAsync: async (sql: string, ...params: unknown[]) => {
      const result = database.prepare(sql).run(...(params as (string | number | null)[]));
      return { changes: Number(result.changes) };
    },
    execAsync: async (sql: string) => {
      database.exec(sql);
    },
    withExclusiveTransactionAsync: async (
      callback: (transaction: TestDatabase) => Promise<void>,
    ) => {
      database.exec('BEGIN');
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
  database.exec(`
    INSERT INTO profiles
      (id, name, age_source, age_years, date_of_birth, gender, input_height_unit,
       height_cm, photo_kind, photo_ref, created_at, updated_at)
    VALUES
      ('p1', 'Alex', 'age', 30, NULL, 'prefer_not_to_say', 'cm', 175, 'none', NULL, 1, 1),
      ('p2', 'Sam', 'age', 31, NULL, 'prefer_not_to_say', 'cm', 180, 'none', NULL, 1, 1);
    INSERT INTO sessions
      (id, profile_id, name, scheduled_at, local_date, timezone_offset_minutes, created_at, updated_at)
    VALUES ('s1', 'p1', 'Workout', 1, '2026-08-20', -330, 1, 1);
    INSERT INTO exercise_catalog
      (id, normalized_name, display_name, use_count, last_used_at, created_at, updated_at, exercise_type)
    VALUES
      ('c1', 'bench press', 'Bench Press', 1, 1, 1, 1, 'free_weight'),
      ('c2', 'row', 'Row', 1, 1, 1, 1, 'machine'),
      ('c3', 'push up', 'Push Up', 1, 1, 1, 1, 'body_weight');
    INSERT INTO session_exercises
      (id, session_id, catalog_id, display_name, normalized_name, exercise_type, position, created_at, updated_at)
    VALUES
      ('e1', 's1', 'c1', 'Bench Press', 'bench press', 'free_weight', 0, 1, 1),
      ('e2', 's1', 'c2', 'Row', 'row', 'machine', 1, 1, 1),
      ('e3', 's1', 'c3', 'Push Up', 'push up', 'body_weight', 2, 1, 1);
  `);
  return database;
}

describe('supersetRepository', () => {
  let database: DatabaseSync;

  beforeEach(() => {
    mockUuidCounter = 0;
    database = createDatabase();
  });

  afterEach(() => database.close());

  test('creates an unlimited ordered group and exposes one collapsed session item', async () => {
    const db = adapter(database) as never;
    const id = await supersetRepository.create(db, 'p1', 's1', {
      name: 'Push Pull Trio',
      members: [
        {
          existingExerciseId: 'e1',
          displayName: 'Bench Press',
          muscleGroupName: '',
          exerciseType: 'free_weight',
        },
        {
          existingExerciseId: 'e2',
          displayName: 'Row',
          muscleGroupName: '',
          exerciseType: 'machine',
        },
        {
          existingExerciseId: 'e3',
          displayName: 'Push Up',
          muscleGroupName: '',
          exerciseType: 'body_weight',
        },
      ],
    });

    const items = await supersetRepository.listSessionItems(db, 'p1', 's1');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'superset', id });
    if (items[0]?.kind === 'superset')
      expect(items[0].superset.members.map((member) => member.exercise.id)).toEqual([
        'e1',
        'e2',
        'e3',
      ]);
  });

  test('aligns unequal existing sets into resumable ordinal rounds', async () => {
    database.exec(`
      INSERT INTO workout_sets
        (id, exercise_id, position, set_kind, reps, input_weight, input_unit,
         weight_kg, weight_lb, tut_seconds, created_at, updated_at)
      VALUES
        ('w1', 'e1', 0, 'strength', 8, 50, 'kg', 50, 110.231, 20, 1, 1),
        ('w2', 'e1', 1, 'strength', 7, 50, 'kg', 50, 110.231, 20, 2, 2),
        ('w3', 'e2', 0, 'strength', 10, 40, 'kg', 40, 88.1848, 20, 1, 1);
    `);
    const db = adapter(database) as never;
    const id = await supersetRepository.create(db, 'p1', 's1', {
      members: [
        {
          existingExerciseId: 'e1',
          displayName: 'Bench Press',
          muscleGroupName: '',
          exerciseType: 'free_weight',
        },
        {
          existingExerciseId: 'e2',
          displayName: 'Row',
          muscleGroupName: '',
          exerciseType: 'machine',
        },
      ],
    });
    const details = await supersetRepository.getDetails(db, 'p1', id);
    expect(details?.rounds).toHaveLength(2);
    expect(details?.rounds[0]).toMatchObject({ status: 'completed' });
    expect(details?.rounds[1].entries.map((entry) => entry.status)).toEqual([
      'completed',
      'pending',
    ]);
    await expect(supersetRepository.startRound(db, 'p1', id)).rejects.toThrow(/pending/i);
  });

  test('saves profile-owned snapshot templates and keeps groups after template deletion', async () => {
    const db = adapter(database) as never;
    const id = await supersetRepository.create(db, 'p1', 's1', {
      name: 'Reusable Pair',
      saveAsTemplate: true,
      members: [
        {
          existingExerciseId: 'e1',
          displayName: 'Bench Press',
          muscleGroupName: '',
          exerciseType: 'free_weight',
        },
        {
          existingExerciseId: 'e2',
          displayName: 'Row',
          muscleGroupName: '',
          exerciseType: 'machine',
        },
      ],
    });
    const templates = await supersetRepository.listTemplates(db, 'p1');
    expect(templates).toHaveLength(1);
    expect(templates[0].members.map((member) => member.displayName)).toEqual([
      'Bench Press',
      'Row',
    ]);
    await expect(supersetRepository.listTemplates(db, 'p2')).resolves.toEqual([]);
    await supersetRepository.removeTemplate(db, 'p1', templates[0].id);
    await expect(supersetRepository.getDetails(db, 'p1', id)).resolves.toMatchObject({
      templateId: null,
    });
  });

  test('completes, skips, later fills, and safely deletes guided round entries', async () => {
    const db = adapter(database) as never;
    const id = await supersetRepository.create(db, 'p1', 's1', {
      members: [
        {
          existingExerciseId: 'e1',
          displayName: 'Bench Press',
          muscleGroupName: '',
          exerciseType: 'free_weight',
        },
        {
          existingExerciseId: 'e3',
          displayName: 'Push Up',
          muscleGroupName: '',
          exerciseType: 'body_weight',
        },
      ],
    });
    const firstEntryId = await supersetRepository.startRound(db, 'p1', id);
    const firstResult = await setRepository.createForRoundEntry(db, 'p1', firstEntryId, {
      kind: 'strength',
      reps: 8,
      inputWeight: 50,
      inputUnit: 'kg',
      tutSeconds: 20,
    });
    expect(firstResult.nextEntryId).toBeTruthy();
    await supersetRepository.skipEntry(db, 'p1', firstResult.nextEntryId!);
    let details = await supersetRepository.getDetails(db, 'p1', id);
    expect(details?.rounds[0]).toMatchObject({ status: 'completed' });
    expect(details?.rounds[0].entries.map((entry) => entry.status)).toEqual([
      'completed',
      'skipped',
    ]);

    const filled = await setRepository.createForRoundEntry(db, 'p1', firstResult.nextEntryId!, {
      kind: 'strength',
      reps: 12,
      inputWeight: null,
      inputUnit: 'kg',
      tutSeconds: 0,
    });
    expect(filled.nextEntryId).toBeNull();
    await setRepository.remove(db, 'p1', filled.workoutSet.id, 'e3');
    details = await supersetRepository.getDetails(db, 'p1', id);
    expect(details?.rounds[0].entries[1]).toMatchObject({ status: 'skipped', workoutSet: null });
  });
});
