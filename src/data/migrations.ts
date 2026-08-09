import type { SQLiteDatabase } from 'expo-sqlite';

const DATABASE_VERSION = 5;

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

export const MIGRATION_V3 = `
  CREATE TABLE bmi_measurements (
    id TEXT PRIMARY KEY NOT NULL,
    measured_at INTEGER NOT NULL,
    local_date TEXT NOT NULL,
    timezone_offset_minutes INTEGER NOT NULL,
    input_weight REAL NOT NULL CHECK(input_weight > 0),
    input_weight_unit TEXT NOT NULL CHECK(input_weight_unit IN ('kg', 'lb')),
    weight_kg REAL NOT NULL CHECK(weight_kg > 0),
    weight_lb REAL NOT NULL CHECK(weight_lb > 0),
    input_height_unit TEXT NOT NULL CHECK(input_height_unit IN ('cm', 'ft-in')),
    height_cm REAL NOT NULL CHECK(height_cm > 0),
    age_years INTEGER NOT NULL CHECK(age_years BETWEEN 18 AND 150),
    gender TEXT NOT NULL CHECK(gender IN ('woman', 'man', 'non_binary', 'prefer_not_to_say')),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX bmi_measurements_measured_at_idx
    ON bmi_measurements(measured_at DESC, created_at DESC);
  PRAGMA user_version = 3;
`;

export const MIGRATION_V4 = `
  ALTER TABLE exercise_catalog
    ADD COLUMN exercise_type TEXT NOT NULL DEFAULT 'free_weight'
    CHECK(exercise_type IN ('free_weight', 'machine', 'body_weight', 'cardio'));
  ALTER TABLE session_exercises
    ADD COLUMN exercise_type TEXT NOT NULL DEFAULT 'free_weight'
    CHECK(exercise_type IN ('free_weight', 'machine', 'body_weight', 'cardio'));

  ALTER TABLE workout_sets RENAME TO workout_sets_v3;

  CREATE TABLE workout_sets (
    id TEXT PRIMARY KEY NOT NULL,
    exercise_id TEXT NOT NULL REFERENCES session_exercises(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    set_kind TEXT NOT NULL CHECK(set_kind IN ('strength', 'duration', 'calories')),
    reps INTEGER,
    input_weight REAL,
    input_unit TEXT,
    weight_kg REAL,
    weight_lb REAL,
    tut_seconds INTEGER,
    duration_seconds INTEGER,
    calories INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(exercise_id, position),
    CHECK(
      (set_kind = 'strength' AND reps >= 1
        AND (input_weight IS NULL OR input_weight >= 0)
        AND input_unit IN ('kg', 'lb')
        AND ((input_weight IS NULL AND weight_kg IS NULL AND weight_lb IS NULL)
          OR (input_weight IS NOT NULL AND weight_kg >= 0 AND weight_lb >= 0))
        AND tut_seconds >= 0
        AND duration_seconds IS NULL AND calories IS NULL)
      OR
      (set_kind = 'duration' AND duration_seconds >= 1
        AND reps IS NULL AND input_weight IS NULL AND input_unit IS NULL
        AND weight_kg IS NULL AND weight_lb IS NULL AND tut_seconds IS NULL AND calories IS NULL)
      OR
      (set_kind = 'calories' AND calories >= 1 AND calories = CAST(calories AS INTEGER)
        AND reps IS NULL AND input_weight IS NULL AND input_unit IS NULL
        AND weight_kg IS NULL AND weight_lb IS NULL AND tut_seconds IS NULL AND duration_seconds IS NULL)
    )
  );

  INSERT INTO workout_sets
    (id, exercise_id, position, set_kind, reps, input_weight, input_unit,
     weight_kg, weight_lb, tut_seconds, duration_seconds, calories, created_at, updated_at)
  SELECT id, exercise_id, position, 'strength', reps, input_weight, input_unit,
         weight_kg, weight_lb, tut_seconds, NULL, NULL, created_at, updated_at
  FROM workout_sets_v3;

  DROP TABLE workout_sets_v3;
  CREATE INDEX workout_sets_exercise_idx ON workout_sets(exercise_id, position);
  CREATE INDEX exercise_catalog_type_idx ON exercise_catalog(exercise_type, last_used_at DESC);
  CREATE INDEX session_exercises_type_idx ON session_exercises(session_id, exercise_type, position);
  PRAGMA user_version = 4;
`;

export const MIGRATION_V5 = `
  CREATE TABLE profiles (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 80),
    age_source TEXT NOT NULL CHECK(age_source IN ('age', 'dob')),
    age_years INTEGER CHECK(age_years BETWEEN 18 AND 150),
    date_of_birth TEXT,
    gender TEXT NOT NULL CHECK(gender IN ('woman', 'man', 'non_binary', 'prefer_not_to_say')),
    input_height_unit TEXT NOT NULL CHECK(input_height_unit IN ('cm', 'ft-in')),
    height_cm REAL NOT NULL CHECK(height_cm > 0),
    photo_kind TEXT NOT NULL DEFAULT 'none' CHECK(photo_kind IN ('none', 'avatar', 'local')),
    photo_ref TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    CHECK(
      (age_source = 'age' AND age_years IS NOT NULL AND date_of_birth IS NULL)
      OR (age_source = 'dob' AND age_years IS NULL AND date_of_birth IS NOT NULL)
    ),
    CHECK(
      (photo_kind = 'none' AND photo_ref IS NULL)
      OR (photo_kind IN ('avatar', 'local') AND photo_ref IS NOT NULL)
    )
  );

  CREATE TABLE profile_state (
    singleton INTEGER PRIMARY KEY NOT NULL CHECK(singleton = 1),
    selected_profile_id TEXT REFERENCES profiles(id) ON DELETE SET NULL
  );
  INSERT INTO profile_state (singleton, selected_profile_id) VALUES (1, NULL);

  ALTER TABLE sessions
    ADD COLUMN profile_id TEXT REFERENCES profiles(id) ON DELETE CASCADE;
  ALTER TABLE bmi_measurements
    ADD COLUMN profile_id TEXT REFERENCES profiles(id) ON DELETE CASCADE;

  CREATE INDEX profiles_updated_at_idx ON profiles(updated_at DESC, created_at DESC);
  CREATE INDEX sessions_profile_local_date_idx ON sessions(profile_id, local_date);
  CREATE INDEX bmi_measurements_profile_measured_at_idx
    ON bmi_measurements(profile_id, measured_at DESC, created_at DESC);
  PRAGMA user_version = 5;
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
      version = 2;
    }
    if (version < 3) {
      await transaction.execAsync(MIGRATION_V3);
      version = 3;
    }
    if (version < 4) {
      await transaction.execAsync(MIGRATION_V4);
      version = 4;
    }
    if (version < 5) {
      await transaction.execAsync(MIGRATION_V5);
    }
  });
}
