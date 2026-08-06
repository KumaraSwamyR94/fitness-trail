import type { SQLiteDatabase } from 'expo-sqlite';

const DATABASE_VERSION = 2;

export const SCHEMA_V1 = `
  CREATE TABLE sessions (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 80),
    scheduled_at INTEGER NOT NULL,
    local_date TEXT NOT NULL,
    timezone_offset_minutes INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE exercise_catalog (
    id TEXT PRIMARY KEY NOT NULL,
    normalized_name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    use_count INTEGER NOT NULL DEFAULT 0,
    last_used_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE session_exercises (
    id TEXT PRIMARY KEY NOT NULL,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    catalog_id TEXT REFERENCES exercise_catalog(id) ON DELETE SET NULL,
    display_name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    position INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(session_id, normalized_name),
    UNIQUE(session_id, position)
  );

  CREATE TABLE workout_sets (
    id TEXT PRIMARY KEY NOT NULL,
    exercise_id TEXT NOT NULL REFERENCES session_exercises(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    reps INTEGER NOT NULL CHECK(reps >= 1),
    input_weight REAL NOT NULL CHECK(input_weight >= 0),
    input_unit TEXT NOT NULL CHECK(input_unit IN ('kg', 'lb')),
    weight_kg REAL NOT NULL CHECK(weight_kg >= 0),
    weight_lb REAL NOT NULL CHECK(weight_lb >= 0),
    tut_seconds INTEGER NOT NULL CHECK(tut_seconds >= 0),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(exercise_id, position)
  );

  CREATE INDEX sessions_local_date_idx ON sessions(local_date);
  CREATE INDEX session_exercises_session_idx ON session_exercises(session_id, position);
  CREATE INDEX workout_sets_exercise_idx ON workout_sets(exercise_id, position);
  CREATE INDEX exercise_catalog_search_idx ON exercise_catalog(normalized_name, last_used_at DESC);
  PRAGMA user_version = 1;
`;

export const MIGRATION_V2 = `
  CREATE TABLE muscle_group_catalog (
    id TEXT PRIMARY KEY NOT NULL,
    normalized_name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL CHECK(length(display_name) BETWEEN 1 AND 80),
    is_predefined INTEGER NOT NULL DEFAULT 0 CHECK(is_predefined IN (0, 1)),
    use_count INTEGER NOT NULL DEFAULT 0,
    last_used_at INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  INSERT INTO muscle_group_catalog
    (id, normalized_name, display_name, is_predefined, use_count, last_used_at, created_at, updated_at)
  VALUES
    ('muscle-back', 'back', 'Back', 1, 0, 0, 0, 0),
    ('muscle-biceps', 'biceps', 'Biceps', 1, 0, 0, 0, 0),
    ('muscle-calves', 'calves', 'Calves', 1, 0, 0, 0, 0),
    ('muscle-chest', 'chest', 'Chest', 1, 0, 0, 0, 0),
    ('muscle-core', 'core', 'Core', 1, 0, 0, 0, 0),
    ('muscle-forearms', 'forearms', 'Forearms', 1, 0, 0, 0, 0),
    ('muscle-glutes', 'glutes', 'Glutes', 1, 0, 0, 0, 0),
    ('muscle-hamstrings', 'hamstrings', 'Hamstrings', 1, 0, 0, 0, 0),
    ('muscle-quadriceps', 'quadriceps', 'Quadriceps', 1, 0, 0, 0, 0),
    ('muscle-shoulders', 'shoulders', 'Shoulders', 1, 0, 0, 0, 0),
    ('muscle-triceps', 'triceps', 'Triceps', 1, 0, 0, 0, 0);

  ALTER TABLE exercise_catalog
    ADD COLUMN muscle_group_id TEXT REFERENCES muscle_group_catalog(id) ON DELETE SET NULL;
  ALTER TABLE session_exercises
    ADD COLUMN muscle_group_id TEXT REFERENCES muscle_group_catalog(id) ON DELETE SET NULL;

  CREATE INDEX muscle_group_catalog_search_idx
    ON muscle_group_catalog(normalized_name, is_predefined DESC, last_used_at DESC);
  CREATE INDEX exercise_catalog_muscle_group_idx ON exercise_catalog(muscle_group_id);
  CREATE INDEX session_exercises_muscle_group_idx ON session_exercises(muscle_group_id);
  PRAGMA user_version = 2;
`;

export async function migrateDatabase(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const currentVersion = row?.user_version ?? 0;
  if (currentVersion >= DATABASE_VERSION) return;

  await db.withExclusiveTransactionAsync(async (transaction) => {
    let version = currentVersion;
    if (currentVersion < 1) {
      await transaction.execAsync(SCHEMA_V1);
      version = 1;
    }
    if (version < 2) {
      await transaction.execAsync(MIGRATION_V2);
    }
  });
}
