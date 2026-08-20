import { DatabaseSync } from 'node:sqlite';

import { setRepository } from '@/data/set-repository';

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'generated-id') }));

function createDatabase(): DatabaseSync {
  const database = new DatabaseSync(':memory:');
  database.exec(`
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      name TEXT NOT NULL,
      scheduled_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE session_exercises (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      catalog_id TEXT,
      display_name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      exercise_type TEXT NOT NULL
    );
    CREATE TABLE workout_sets (
      id TEXT PRIMARY KEY,
      exercise_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      set_kind TEXT NOT NULL,
      reps INTEGER,
      input_weight REAL,
      input_unit TEXT,
      weight_kg REAL,
      weight_lb REAL,
      tut_seconds INTEGER,
      duration_seconds INTEGER,
      calories INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  return database;
}

function repositoryDatabase(database: DatabaseSync) {
  return {
    getFirstAsync: async (sql: string, ...params: unknown[]) =>
      database.prepare(sql).get(...(params as (string | number | null)[])) ?? null,
    getAllAsync: async (sql: string, ...params: unknown[]) =>
      database.prepare(sql).all(...(params as (string | number | null)[])),
  } as never;
}

describe('setRepository.getPreviousWorkout', () => {
  let database: DatabaseSync;

  beforeEach(() => {
    database = createDatabase();
  });

  afterEach(() => {
    database.close();
  });

  test('returns every ordered set from the nearest earlier catalog match that contains sets', async () => {
    database.exec(`
      INSERT INTO sessions VALUES
        ('old', 'p1', 'Old workout', 100, 10),
        ('empty', 'p1', 'Empty workout', 150, 20),
        ('other-exercise', 'p1', 'Other exercise', 190, 30),
        ('other-profile', 'p2', 'Private workout', 195, 40),
        ('current', 'p1', 'Current workout', 200, 50),
        ('future', 'p1', 'Future workout', 250, 60);
      INSERT INTO session_exercises VALUES
        ('old-exercise', 'old', 'push-up', 'Push Up', 'push up', 'body_weight'),
        ('empty-exercise', 'empty', 'push-up', 'Push Up', 'push up', 'body_weight'),
        ('different-catalog', 'other-exercise', 'press-up', 'Push Up', 'push up', 'body_weight'),
        ('private-exercise', 'other-profile', 'push-up', 'Push Up', 'push up', 'body_weight'),
        ('current-exercise', 'current', 'push-up', 'Push Up', 'push up', 'body_weight'),
        ('future-exercise', 'future', 'push-up', 'Push Up', 'push up', 'body_weight');
      INSERT INTO workout_sets VALUES
        ('old-set-2', 'old-exercise', 1, 'strength', 10, 5, 'kg', 5, 11.0231, 20, NULL, NULL, 2, 2),
        ('old-set-1', 'old-exercise', 0, 'strength', 12, NULL, 'kg', NULL, NULL, 15, NULL, NULL, 1, 1),
        ('different-set', 'different-catalog', 0, 'strength', 20, NULL, 'kg', NULL, NULL, 0, NULL, NULL, 3, 3),
        ('private-set', 'private-exercise', 0, 'strength', 99, NULL, 'kg', NULL, NULL, 0, NULL, NULL, 4, 4),
        ('future-set', 'future-exercise', 0, 'strength', 50, NULL, 'kg', NULL, NULL, 0, NULL, NULL, 5, 5);
    `);

    const result = await setRepository.getPreviousWorkout(
      repositoryDatabase(database),
      'p1',
      'current-exercise',
    );

    expect(result).toMatchObject({
      sessionId: 'old',
      sessionName: 'Old workout',
      scheduledAt: 100,
      exerciseId: 'old-exercise',
      exerciseName: 'Push Up',
      exerciseType: 'body_weight',
    });
    expect(result?.sets.map((set) => set.id)).toEqual(['old-set-1', 'old-set-2']);
    expect(result?.sets[0]).toMatchObject({
      kind: 'strength',
      reps: 12,
      inputWeight: null,
      weightKg: null,
      weightLb: null,
    });
  });

  test('uses normalized name and type for legacy exercises and creation time for equal dates', async () => {
    database.exec(`
      INSERT INTO sessions VALUES
        ('legacy', 'p1', 'Morning cardio', 200, 10),
        ('wrong-type', 'p1', 'Strength workout', 200, 20),
        ('current', 'p1', 'Evening cardio', 200, 30);
      INSERT INTO session_exercises VALUES
        ('legacy-run', 'legacy', NULL, 'Run', 'run', 'cardio'),
        ('strength-run', 'wrong-type', NULL, 'Run', 'run', 'free_weight'),
        ('current-run', 'current', NULL, 'Running', 'run', 'cardio');
      INSERT INTO workout_sets VALUES
        ('duration', 'legacy-run', 0, 'duration', NULL, NULL, NULL, NULL, NULL, NULL, 605, NULL, 1, 1),
        ('calories', 'legacy-run', 1, 'calories', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 120, 2, 2),
        ('wrong-type-set', 'strength-run', 0, 'strength', 8, 20, 'kg', 20, 44.0924, 0, NULL, NULL, 3, 3);
    `);

    const result = await setRepository.getPreviousWorkout(
      repositoryDatabase(database),
      'p1',
      'current-run',
    );

    expect(result?.sessionId).toBe('legacy');
    expect(result?.sets).toEqual([
      expect.objectContaining({ kind: 'duration', durationSeconds: 605 }),
      expect.objectContaining({ kind: 'calories', calories: 120 }),
    ]);
  });

  test('returns null when only future, other-profile, or nonmatching history exists', async () => {
    database.exec(`
      INSERT INTO sessions VALUES
        ('current', 'p1', 'Current workout', 100, 10),
        ('future', 'p1', 'Future workout', 200, 20),
        ('private', 'p2', 'Private workout', 50, 5),
        ('different', 'p1', 'Different workout', 50, 5);
      INSERT INTO session_exercises VALUES
        ('current-exercise', 'current', 'squat', 'Squat', 'squat', 'free_weight'),
        ('future-exercise', 'future', 'squat', 'Squat', 'squat', 'free_weight'),
        ('private-exercise', 'private', 'squat', 'Squat', 'squat', 'free_weight'),
        ('different-exercise', 'different', 'deadlift', 'Deadlift', 'deadlift', 'free_weight');
      INSERT INTO workout_sets VALUES
        ('future-set', 'future-exercise', 0, 'strength', 5, 100, 'kg', 100, 220.462, 10, NULL, NULL, 1, 1),
        ('private-set', 'private-exercise', 0, 'strength', 5, 100, 'kg', 100, 220.462, 10, NULL, NULL, 1, 1),
        ('different-set', 'different-exercise', 0, 'strength', 5, 100, 'kg', 100, 220.462, 10, NULL, NULL, 1, 1);
    `);

    await expect(
      setRepository.getPreviousWorkout(repositoryDatabase(database), 'p1', 'current-exercise'),
    ).resolves.toBeNull();
  });
});
