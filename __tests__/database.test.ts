import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  MIGRATION_V2,
  MIGRATION_V3,
  MIGRATION_V4,
  MIGRATION_V5,
  MIGRATION_V6,
  SCHEMA_V1,
} from '@/data/migrations';

function sqlite(database: string, sql: string): string {
  return execFileSync('/usr/bin/sqlite3', [database], {
    encoding: 'utf8',
    input: `.bail on\nPRAGMA foreign_keys = ON;\n${sql}`,
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

describe('SQLite migration and relational integrity', () => {
  let database: string;

  beforeEach(() => {
    database = path.join(mkdtempSync(path.join(tmpdir(), 'fitness-trail-db-')), 'journal.db');
    sqlite(database, `${SCHEMA_V1}\n${MIGRATION_V2}\n${MIGRATION_V3}\n${MIGRATION_V4}`);
  });

  test('creates the versioned schema and calendar/relationship indexes', () => {
    expect(sqlite(database, 'PRAGMA user_version;')).toBe('4');
    const indexes = sqlite(
      database,
      "SELECT name FROM sqlite_master WHERE type = 'index' ORDER BY name;",
    );
    expect(indexes).toContain('muscle_group_catalog_search_idx');
    expect(indexes).toContain('bmi_measurements_measured_at_idx');
    expect(indexes).toContain('sessions_local_date_idx');
    expect(indexes).toContain('workout_sets_exercise_idx');
  });

  test('migrates version 2 data without changing workout records', () => {
    const versionTwoDatabase = path.join(
      mkdtempSync(path.join(tmpdir(), 'fitness-trail-v2-db-')),
      'journal.db',
    );
    sqlite(versionTwoDatabase, `${SCHEMA_V1}\n${MIGRATION_V2}`);
    sqlite(
      versionTwoDatabase,
      "INSERT INTO sessions VALUES ('s1', 'Session', 1, '2026-08-03', -330, 1, 1);",
    );

    sqlite(versionTwoDatabase, MIGRATION_V3);

    expect(sqlite(versionTwoDatabase, 'PRAGMA user_version;')).toBe('3');
    expect(sqlite(versionTwoDatabase, 'SELECT name FROM sessions WHERE id = "s1";')).toBe(
      'Session',
    );
    expect(
      sqlite(
        versionTwoDatabase,
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'bmi_measurements';",
      ),
    ).toBe('bmi_measurements');
  });

  test('migrates version 3 exercises and sets as free-weight strength records', () => {
    const versionThreeDatabase = path.join(
      mkdtempSync(path.join(tmpdir(), 'fitness-trail-v3-db-')),
      'journal.db',
    );
    sqlite(versionThreeDatabase, `${SCHEMA_V1}\n${MIGRATION_V2}\n${MIGRATION_V3}`);
    sqlite(
      versionThreeDatabase,
      `
      INSERT INTO sessions VALUES ('s1', 'Session', 1, '2026-08-03', -330, 1, 1);
      INSERT INTO session_exercises
        (id, session_id, catalog_id, display_name, normalized_name, position, created_at, updated_at, muscle_group_id)
      VALUES ('e1', 's1', NULL, 'Squat', 'squat', 0, 1, 1, 'muscle-quadriceps');
      INSERT INTO workout_sets VALUES ('w1', 'e1', 0, 5, 100, 'kg', 100, 220.462, 18, 1, 1);
    `,
    );

    sqlite(versionThreeDatabase, MIGRATION_V4);

    expect(sqlite(versionThreeDatabase, 'PRAGMA user_version;')).toBe('4');
    expect(
      sqlite(versionThreeDatabase, "SELECT exercise_type FROM session_exercises WHERE id = 'e1';"),
    ).toBe('free_weight');
    expect(
      sqlite(
        versionThreeDatabase,
        "SELECT set_kind || ':' || reps || ':' || input_weight FROM workout_sets WHERE id = 'w1';",
      ),
    ).toBe('strength:5:100.0');
  });

  test('stores multiple same-day BMI measurements in timestamp order and supports updates and deletion', () => {
    sqlite(
      database,
      `
      INSERT INTO bmi_measurements VALUES
        ('b1', 100, '2026-08-06', -330, 70, 'kg', 70, 154.3234, 'cm', 175, 30, 'woman', 1, 1),
        ('b2', 200, '2026-08-06', -330, 155, 'lb', 70.3068, 155, 'ft-in', 175.26, 30, 'woman', 2, 2);
    `,
    );
    expect(sqlite(database, 'SELECT id FROM bmi_measurements ORDER BY measured_at DESC;')).toBe(
      'b2\nb1',
    );
    sqlite(database, "UPDATE bmi_measurements SET age_years = 31, updated_at = 3 WHERE id = 'b1';");
    expect(
      sqlite(
        database,
        "SELECT age_years || ':' || updated_at FROM bmi_measurements WHERE id = 'b1';",
      ),
    ).toBe('31:3');
    sqlite(database, "DELETE FROM bmi_measurements WHERE id = 'b2';");
    expect(sqlite(database, 'SELECT COUNT(*) FROM bmi_measurements;')).toBe('1');
  });

  test('enforces BMI measurement units, positive values, adult ages, and gender choices', () => {
    expect(() =>
      sqlite(
        database,
        `
      INSERT INTO bmi_measurements VALUES
        ('bad', 100, '2026-08-06', -330, 0, 'stone', 0, 0, 'meter', 0, 17, 'unknown', 1, 1);
    `,
      ),
    ).toThrow();
  });

  test('migrates version 1 data and seeds the major muscle groups', () => {
    const versionOneDatabase = path.join(
      mkdtempSync(path.join(tmpdir(), 'fitness-trail-v1-db-')),
      'journal.db',
    );
    sqlite(versionOneDatabase, SCHEMA_V1);
    sqlite(
      versionOneDatabase,
      `
      INSERT INTO sessions VALUES ('s1', 'Session', 1, '2026-08-03', -330, 1, 1);
      INSERT INTO exercise_catalog VALUES ('c1', 'squat', 'Squat', 1, 1, 1, 1);
      INSERT INTO session_exercises VALUES ('e1', 's1', 'c1', 'Squat', 'squat', 0, 1, 1);
    `,
    );

    sqlite(versionOneDatabase, MIGRATION_V2);

    expect(sqlite(versionOneDatabase, 'PRAGMA user_version;')).toBe('2');
    expect(sqlite(versionOneDatabase, 'SELECT COUNT(*) FROM muscle_group_catalog;')).toBe('11');
    expect(
      sqlite(
        versionOneDatabase,
        `
      SELECT display_name || ':' || COALESCE(muscle_group_id, 'none')
      FROM session_exercises WHERE id = 'e1';
    `,
      ),
    ).toBe('Squat:none');
  });

  test('persists complete history across connections and cascades deletion', () => {
    sqlite(
      database,
      `
      INSERT INTO sessions VALUES ('s1', 'Monday Session', 1, '2026-08-03', -330, 1, 1);
      INSERT INTO exercise_catalog
        (id, normalized_name, display_name, use_count, last_used_at, created_at, updated_at, muscle_group_id)
      VALUES ('c1', 'squat', 'Squat', 1, 1, 1, 1, 'muscle-quadriceps');
      INSERT INTO session_exercises
        (id, session_id, catalog_id, display_name, normalized_name, position, created_at, updated_at, muscle_group_id)
      VALUES ('e1', 's1', 'c1', 'Squat', 'squat', 0, 1, 1, 'muscle-quadriceps');
      INSERT INTO workout_sets
        (id, exercise_id, position, set_kind, reps, input_weight, input_unit, weight_kg, weight_lb, tut_seconds, created_at, updated_at)
      VALUES ('w1', 'e1', 0, 'strength', 5, 100, 'kg', 100, 220.462, 18, 1, 1);
    `,
    );
    expect(
      sqlite(database, 'SELECT reps || ":" || weight_kg FROM workout_sets WHERE id = "w1";'),
    ).toBe('5:100.0');
    sqlite(database, "DELETE FROM sessions WHERE id = 's1';");
    expect(sqlite(database, 'SELECT COUNT(*) FROM session_exercises;')).toBe('0');
    expect(sqlite(database, 'SELECT COUNT(*) FROM workout_sets;')).toBe('0');
    expect(sqlite(database, 'SELECT COUNT(*) FROM exercise_catalog;')).toBe('1');
  });

  test('rolls back failed transactions and enforces session duplicates', () => {
    sqlite(database, "INSERT INTO sessions VALUES ('s1', 'Session', 1, '2026-08-03', -330, 1, 1);");
    expect(() =>
      sqlite(
        database,
        `
      BEGIN;
      INSERT INTO session_exercises
        (id, session_id, catalog_id, display_name, normalized_name, position, created_at, updated_at)
      VALUES ('e1', 's1', NULL, 'Squat', 'squat', 0, 1, 1);
      INSERT INTO session_exercises
        (id, session_id, catalog_id, display_name, normalized_name, position, created_at, updated_at)
      VALUES ('e2', 's1', NULL, 'SQUAT', 'squat', 1, 1, 1);
      COMMIT;
    `,
      ),
    ).toThrow();
    expect(sqlite(database, 'SELECT COUNT(*) FROM session_exercises;')).toBe('0');
  });

  test('orders prefix catalog matches before more recent contains matches', () => {
    sqlite(
      database,
      `
      INSERT INTO exercise_catalog
        (id, normalized_name, display_name, use_count, last_used_at, created_at, updated_at)
      VALUES ('c1', 'bench press', 'Bench Press', 4, 10, 1, 1);
      INSERT INTO exercise_catalog
        (id, normalized_name, display_name, use_count, last_used_at, created_at, updated_at)
      VALUES ('c2', 'bench row', 'Bench Row', 2, 50, 1, 1);
      INSERT INTO exercise_catalog
        (id, normalized_name, display_name, use_count, last_used_at, created_at, updated_at)
      VALUES ('c3', 'incline bench press', 'Incline Bench Press', 8, 1000, 1, 1);
    `,
    );
    const result = sqlite(
      database,
      `
      SELECT display_name FROM exercise_catalog
      WHERE instr(normalized_name, 'bench') > 0
      ORDER BY CASE WHEN instr(normalized_name, 'bench') = 1 THEN 0 ELSE 1 END,
               last_used_at DESC, display_name COLLATE NOCASE;
    `,
    );
    expect(result.split('\n')).toEqual(['Bench Row', 'Bench Press', 'Incline Bench Press']);
  });

  test('supports reusable custom muscle groups linked to exercises', () => {
    sqlite(
      database,
      `
      INSERT INTO sessions VALUES ('s1', 'Session', 1, '2026-08-03', -330, 1, 1);
      INSERT INTO muscle_group_catalog
        (id, normalized_name, display_name, is_predefined, use_count, last_used_at, created_at, updated_at)
      VALUES ('custom-1', 'rotator cuff', 'Rotator Cuff', 0, 1, 1, 1, 1);
      INSERT INTO exercise_catalog
        (id, normalized_name, display_name, use_count, last_used_at, created_at, updated_at, muscle_group_id)
      VALUES ('c1', 'external rotation', 'External Rotation', 1, 1, 1, 1, 'custom-1');
      INSERT INTO session_exercises
        (id, session_id, catalog_id, display_name, normalized_name, position, created_at, updated_at, muscle_group_id)
      VALUES ('e1', 's1', 'c1', 'External Rotation', 'external rotation', 0, 1, 1, 'custom-1');
    `,
    );
    expect(
      sqlite(
        database,
        `
      SELECT se.display_name || ':' || mg.display_name
      FROM session_exercises se
      JOIN muscle_group_catalog mg ON mg.id = se.muscle_group_id;
    `,
      ),
    ).toBe('External Rotation:Rotator Cuff');
  });

  test('enforces category-specific strength, duration, and calorie set shapes', () => {
    sqlite(
      database,
      `
      INSERT INTO sessions VALUES ('s1', 'Session', 1, '2026-08-03', -330, 1, 1);
      INSERT INTO session_exercises
        (id, session_id, catalog_id, display_name, normalized_name, position, created_at, updated_at, exercise_type)
      VALUES
        ('e1', 's1', NULL, 'Push Up', 'push up', 0, 1, 1, 'body_weight'),
        ('e2', 's1', NULL, 'Running', 'running', 1, 1, 1, 'cardio');
      INSERT INTO workout_sets
        (id, exercise_id, position, set_kind, reps, input_weight, input_unit, tut_seconds, created_at, updated_at)
      VALUES ('strength', 'e1', 0, 'strength', 12, NULL, 'kg', 0, 1, 1);
      INSERT INTO workout_sets
        (id, exercise_id, position, set_kind, duration_seconds, created_at, updated_at)
      VALUES ('duration', 'e2', 0, 'duration', 605, 1, 1);
      INSERT INTO workout_sets
        (id, exercise_id, position, set_kind, calories, created_at, updated_at)
      VALUES ('calories', 'e2', 1, 'calories', 120, 1, 1);
    `,
    );
    expect(sqlite(database, 'SELECT COUNT(*) FROM workout_sets;')).toBe('3');
    expect(() =>
      sqlite(
        database,
        `
      INSERT INTO workout_sets
        (id, exercise_id, position, set_kind, duration_seconds, calories, created_at, updated_at)
      VALUES ('mixed', 'e2', 2, 'duration', 60, 10, 1, 1);
    `,
      ),
    ).toThrow();
    expect(() =>
      sqlite(
        database,
        `
      INSERT INTO workout_sets
        (id, exercise_id, position, set_kind, calories, created_at, updated_at)
      VALUES ('fractional', 'e2', 2, 'calories', 10.5, 1, 1);
    `,
      ),
    ).toThrow();
  });

  test('keeps multi-year calendar queries responsive', () => {
    sqlite(
      database,
      `
      WITH RECURSIVE days(value) AS (
        SELECT 0 UNION ALL SELECT value + 1 FROM days WHERE value < 1824
      )
      INSERT INTO sessions
      SELECT printf('s%d', value), printf('Session %d', value), value,
             date('2021-01-01', printf('+%d days', value)), 0, value, value
      FROM days;

      WITH exercise_numbers(value) AS (VALUES (0), (1), (2))
      INSERT INTO session_exercises
        (id, session_id, catalog_id, display_name, normalized_name, position, created_at, updated_at)
      SELECT printf('e%d-%d', s.rowid, exercise_numbers.value), s.id, NULL,
             printf('Exercise %d', exercise_numbers.value), printf('exercise %d', exercise_numbers.value),
             exercise_numbers.value, s.created_at, s.updated_at
      FROM sessions s CROSS JOIN exercise_numbers;

      WITH set_numbers(value) AS (VALUES (0), (1), (2), (3), (4))
      INSERT INTO workout_sets
        (id, exercise_id, position, set_kind, reps, input_weight, input_unit,
         weight_kg, weight_lb, tut_seconds, created_at, updated_at)
      SELECT printf('w%s-%d', se.id, set_numbers.value), se.id, set_numbers.value,
             'strength', 8, 100, 'kg', 100, 220.462, 20, se.created_at, se.updated_at
      FROM session_exercises se CROSS JOIN set_numbers;
    `,
    );
    const startedAt = performance.now();
    const result = sqlite(
      database,
      `
      SELECT COUNT(*), SUM(exercise_count), SUM(set_count) FROM (
        SELECT s.id, COUNT(DISTINCT se.id) AS exercise_count, COUNT(ws.id) AS set_count
        FROM sessions s
        LEFT JOIN session_exercises se ON se.session_id = s.id
        LEFT JOIN workout_sets ws ON ws.exercise_id = se.id
        WHERE s.local_date BETWEEN '2024-01-01' AND '2024-01-31'
        GROUP BY s.id
      );
    `,
    );
    expect(result).toBe('31|93|465');
    expect(performance.now() - startedAt).toBeLessThan(3000);
  });
});

describe('profile migration and ownership integrity', () => {
  let database: string;

  beforeEach(() => {
    database = path.join(
      mkdtempSync(path.join(tmpdir(), 'fitness-trail-profiles-db-')),
      'journal.db',
    );
    sqlite(database, `${SCHEMA_V1}\n${MIGRATION_V2}\n${MIGRATION_V3}\n${MIGRATION_V4}`);
    sqlite(
      database,
      `
      INSERT INTO sessions
        (id, name, scheduled_at, local_date, timezone_offset_minutes, created_at, updated_at)
      VALUES ('legacy-session', 'Legacy Session', 1, '2026-08-03', -330, 1, 1);
      INSERT INTO bmi_measurements
        (id, measured_at, local_date, timezone_offset_minutes, input_weight, input_weight_unit,
         weight_kg, weight_lb, input_height_unit, height_cm, age_years, gender, created_at, updated_at)
      VALUES ('legacy-bmi', 2, '2026-08-03', -330, 70, 'kg', 70, 154.3234, 'cm', 175, 30, 'woman', 1, 1);
    `,
    );
    sqlite(database, MIGRATION_V5);
  });

  test('upgrades version 4 without assigning legacy records prematurely', () => {
    expect(sqlite(database, 'PRAGMA user_version;')).toBe('5');
    expect(sqlite(database, 'SELECT COUNT(*) FROM profiles;')).toBe('0');
    expect(
      sqlite(
        database,
        "SELECT COALESCE(profile_id, 'unassigned') FROM sessions WHERE id = 'legacy-session';",
      ),
    ).toBe('unassigned');
    expect(
      sqlite(
        database,
        "SELECT COALESCE(profile_id, 'unassigned') FROM bmi_measurements WHERE id = 'legacy-bmi';",
      ),
    ).toBe('unassigned');
    const indexes = sqlite(
      database,
      "SELECT name FROM sqlite_master WHERE type = 'index' ORDER BY name;",
    );
    expect(indexes).toContain('sessions_profile_local_date_idx');
    expect(indexes).toContain('bmi_measurements_profile_measured_at_idx');
  });

  test('supports first-profile legacy adoption, persistent selection, and isolated queries', () => {
    sqlite(
      database,
      `
      INSERT INTO profiles
        (id, name, age_source, age_years, date_of_birth, gender, input_height_unit,
         height_cm, photo_kind, photo_ref, created_at, updated_at)
      VALUES
        ('p1', 'Alex', 'age', 30, NULL, 'non_binary', 'cm', 175, 'none', NULL, 1, 1),
        ('p2', 'Sam', 'dob', NULL, '1990-01-01', 'prefer_not_to_say', 'ft-in', 180, 'avatar', 'trail-01', 2, 2);
      UPDATE sessions SET profile_id = 'p1' WHERE profile_id IS NULL;
      UPDATE bmi_measurements SET profile_id = 'p1' WHERE profile_id IS NULL;
      UPDATE profile_state SET selected_profile_id = 'p1' WHERE singleton = 1;
      INSERT INTO sessions
        (id, profile_id, name, scheduled_at, local_date, timezone_offset_minutes, created_at, updated_at)
      VALUES ('p2-session', 'p2', 'Other Session', 3, '2026-08-03', -330, 3, 3);
    `,
    );
    expect(
      sqlite(database, 'SELECT selected_profile_id FROM profile_state WHERE singleton = 1;'),
    ).toBe('p1');
    expect(sqlite(database, "SELECT id FROM sessions WHERE profile_id = 'p1';")).toBe(
      'legacy-session',
    );
    expect(sqlite(database, "SELECT id FROM sessions WHERE profile_id = 'p2';")).toBe('p2-session');
    expect(
      sqlite(database, "SELECT profile_id FROM bmi_measurements WHERE id = 'legacy-bmi';"),
    ).toBe('p1');
  });

  test('cascades profile history while preserving the shared exercise catalog', () => {
    sqlite(
      database,
      `
      INSERT INTO profiles
        (id, name, age_source, age_years, date_of_birth, gender, input_height_unit,
         height_cm, photo_kind, photo_ref, created_at, updated_at)
      VALUES ('p1', 'Alex', 'age', 30, NULL, 'woman', 'cm', 175, 'none', NULL, 1, 1);
      UPDATE sessions SET profile_id = 'p1';
      UPDATE bmi_measurements SET profile_id = 'p1';
      INSERT INTO exercise_catalog
        (id, normalized_name, display_name, use_count, last_used_at, created_at, updated_at, exercise_type)
      VALUES ('catalog-1', 'squat', 'Squat', 1, 1, 1, 1, 'free_weight');
      INSERT INTO session_exercises
        (id, session_id, catalog_id, display_name, normalized_name, exercise_type, position, created_at, updated_at)
      VALUES ('exercise-1', 'legacy-session', 'catalog-1', 'Squat', 'squat', 'free_weight', 0, 1, 1);
      INSERT INTO workout_sets
        (id, exercise_id, position, set_kind, reps, input_weight, input_unit,
         weight_kg, weight_lb, tut_seconds, created_at, updated_at)
      VALUES ('set-1', 'exercise-1', 0, 'strength', 5, 100, 'kg', 100, 220.462, 20, 1, 1);
      DELETE FROM profiles WHERE id = 'p1';
    `,
    );
    expect(sqlite(database, 'SELECT COUNT(*) FROM sessions;')).toBe('0');
    expect(sqlite(database, 'SELECT COUNT(*) FROM session_exercises;')).toBe('0');
    expect(sqlite(database, 'SELECT COUNT(*) FROM workout_sets;')).toBe('0');
    expect(sqlite(database, 'SELECT COUNT(*) FROM bmi_measurements;')).toBe('0');
    expect(sqlite(database, 'SELECT COUNT(*) FROM exercise_catalog;')).toBe('1');
  });

  test('enforces complete age/photo shapes and foreign keys', () => {
    expect(() =>
      sqlite(
        database,
        `
      INSERT INTO profiles
        (id, name, age_source, age_years, date_of_birth, gender, input_height_unit,
         height_cm, photo_kind, photo_ref, created_at, updated_at)
      VALUES ('bad', 'Bad', 'age', NULL, '2000-01-01', 'woman', 'cm', 175, 'none', 'unexpected', 1, 1);
    `,
      ),
    ).toThrow();
    expect(() =>
      sqlite(
        database,
        `
      UPDATE sessions SET profile_id = 'missing' WHERE id = 'legacy-session';
    `,
      ),
    ).toThrow();
  });
});

describe('superset migration and relational integrity', () => {
  let database: string;

  beforeEach(() => {
    database = path.join(
      mkdtempSync(path.join(tmpdir(), 'fitness-trail-supersets-db-')),
      'journal.db',
    );
    sqlite(
      database,
      `${SCHEMA_V1}\n${MIGRATION_V2}\n${MIGRATION_V3}\n${MIGRATION_V4}\n${MIGRATION_V5}\n${MIGRATION_V6}`,
    );
    sqlite(
      database,
      `
      INSERT INTO profiles
        (id, name, age_source, age_years, date_of_birth, gender, input_height_unit,
         height_cm, photo_kind, photo_ref, created_at, updated_at)
      VALUES ('p1', 'Alex', 'age', 30, NULL, 'prefer_not_to_say', 'cm', 175, 'none', NULL, 1, 1);
      INSERT INTO sessions
        (id, profile_id, name, scheduled_at, local_date, timezone_offset_minutes, created_at, updated_at)
      VALUES ('s1', 'p1', 'Upper Body', 1, '2026-08-20', -330, 1, 1);
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
    `,
    );
  });

  test('creates profile templates, session groups, ordered members, rounds, and entries', () => {
    expect(sqlite(database, 'PRAGMA user_version;')).toBe('6');
    sqlite(
      database,
      `
      INSERT INTO superset_templates VALUES ('t1', 'p1', 'Push Pull', 1, 1);
      INSERT INTO superset_template_members VALUES
        ('tm1', 't1', 'c1', 'Bench Press', 'bench press', NULL, 'free_weight', 0),
        ('tm2', 't1', 'c2', 'Row', 'row', NULL, 'machine', 1);
      INSERT INTO supersets VALUES ('ss1', 's1', 't1', 'Push Pull', 1, 1);
      INSERT INTO superset_members VALUES ('ss1', 'e1', 0, 1), ('ss1', 'e2', 1, 1);
      INSERT INTO superset_rounds VALUES ('r1', 'ss1', 0, 'in_progress', NULL, 1, 1);
      INSERT INTO superset_round_entries VALUES
        ('re1', 'r1', 'e1', 0, 'pending', NULL, 1, 1),
        ('re2', 'r1', 'e2', 1, 'skipped', NULL, 1, 1);
    `,
    );
    expect(
      sqlite(
        database,
        `SELECT ss.name || ':' || COUNT(sm.exercise_id)
         FROM supersets ss JOIN superset_members sm ON sm.superset_id = ss.id
         GROUP BY ss.id;`,
      ),
    ).toBe('Push Pull:2');
    expect(
      sqlite(
        database,
        "SELECT status FROM superset_round_entries WHERE round_id = 'r1' ORDER BY position;",
      ),
    ).toBe('pending\nskipped');
  });

  test('enforces single-group membership and valid completed entry links', () => {
    sqlite(
      database,
      `
      INSERT INTO supersets VALUES ('ss1', 's1', NULL, 'First', 1, 1);
      INSERT INTO supersets VALUES ('ss2', 's1', NULL, 'Second', 1, 1);
      INSERT INTO superset_members VALUES ('ss1', 'e1', 0, 1), ('ss1', 'e2', 1, 1);
      INSERT INTO superset_rounds VALUES ('r1', 'ss1', 0, 'in_progress', NULL, 1, 1);
    `,
    );
    expect(() =>
      sqlite(database, "INSERT INTO superset_members VALUES ('ss2', 'e1', 0, 1);"),
    ).toThrow();
    expect(() =>
      sqlite(
        database,
        "INSERT INTO superset_round_entries VALUES ('bad', 'r1', 'e1', 0, 'completed', NULL, 1, 1);",
      ),
    ).toThrow();
  });

  test('dissolving preserves exercises and sets while profile deletion removes templates', () => {
    sqlite(
      database,
      `
      INSERT INTO superset_templates VALUES ('t1', 'p1', 'Push Pull', 1, 1);
      INSERT INTO supersets VALUES ('ss1', 's1', 't1', 'Push Pull', 1, 1);
      INSERT INTO superset_members VALUES ('ss1', 'e1', 0, 1), ('ss1', 'e2', 1, 1);
      INSERT INTO workout_sets
        (id, exercise_id, position, set_kind, reps, input_weight, input_unit,
         weight_kg, weight_lb, tut_seconds, created_at, updated_at)
      VALUES ('w1', 'e1', 0, 'strength', 8, 50, 'kg', 50, 110.231, 20, 1, 1);
      DELETE FROM supersets WHERE id = 'ss1';
    `,
    );
    expect(sqlite(database, 'SELECT COUNT(*) FROM session_exercises;')).toBe('3');
    expect(sqlite(database, 'SELECT COUNT(*) FROM workout_sets;')).toBe('1');
    expect(sqlite(database, 'SELECT COUNT(*) FROM superset_templates;')).toBe('1');
    sqlite(database, "DELETE FROM profiles WHERE id = 'p1';");
    expect(sqlite(database, 'SELECT COUNT(*) FROM superset_templates;')).toBe('0');
  });

  test('cascades completed rounds when their session is deleted', () => {
    sqlite(
      database,
      `
      INSERT INTO supersets VALUES ('ss1', 's1', NULL, 'Push Pull', 1, 1);
      INSERT INTO superset_members VALUES ('ss1', 'e1', 0, 1), ('ss1', 'e2', 1, 1);
      INSERT INTO workout_sets
        (id, exercise_id, position, set_kind, reps, input_weight, input_unit,
         weight_kg, weight_lb, tut_seconds, created_at, updated_at)
      VALUES
        ('w1', 'e1', 0, 'strength', 8, 50, 'kg', 50, 110.231, 20, 1, 1),
        ('w2', 'e2', 0, 'strength', 10, 40, 'kg', 40, 88.1848, 20, 1, 1);
      INSERT INTO superset_rounds VALUES ('r1', 'ss1', 0, 'completed', 2, 1, 2);
      INSERT INTO superset_round_entries VALUES
        ('re1', 'r1', 'e1', 0, 'completed', 'w1', 1, 1),
        ('re2', 'r1', 'e2', 1, 'completed', 'w2', 1, 1);
      DELETE FROM sessions WHERE id = 's1';
    `,
    );
    expect(sqlite(database, 'SELECT COUNT(*) FROM supersets;')).toBe('0');
    expect(sqlite(database, 'SELECT COUNT(*) FROM superset_round_entries;')).toBe('0');
    expect(sqlite(database, 'SELECT COUNT(*) FROM workout_sets;')).toBe('0');
  });
});
