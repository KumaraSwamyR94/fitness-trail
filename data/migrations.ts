import type { SQLiteDatabase } from 'expo-sqlite';

const DATABASE_VERSION = 1;

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

export async function migrateDatabase(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const currentVersion = row?.user_version ?? 0;
  if (currentVersion >= DATABASE_VERSION) return;

  await db.withExclusiveTransactionAsync(async (transaction) => {
    if (currentVersion < 1) {
      await transaction.execAsync(SCHEMA_V1);
    }
  });
}
