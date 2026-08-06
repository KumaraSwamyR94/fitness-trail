import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { MIGRATION_V2, SCHEMA_V1 } from '@/data/migrations';

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
    sqlite(database, `${SCHEMA_V1}\n${MIGRATION_V2}`);
  });

  test('creates the versioned schema and calendar/relationship indexes', () => {
    expect(sqlite(database, 'PRAGMA user_version;')).toBe('2');
    const indexes = sqlite(database, "SELECT name FROM sqlite_master WHERE type = 'index' ORDER BY name;");
    expect(indexes).toContain('muscle_group_catalog_search_idx');
    expect(indexes).toContain('sessions_local_date_idx');
    expect(indexes).toContain('workout_sets_exercise_idx');
  });

  test('migrates version 1 data and seeds the major muscle groups', () => {
    const versionOneDatabase = path.join(
      mkdtempSync(path.join(tmpdir(), 'fitness-trail-v1-db-')),
      'journal.db',
    );
    sqlite(versionOneDatabase, SCHEMA_V1);
    sqlite(versionOneDatabase, `
      INSERT INTO sessions VALUES ('s1', 'Session', 1, '2026-08-03', -330, 1, 1);
      INSERT INTO exercise_catalog VALUES ('c1', 'squat', 'Squat', 1, 1, 1, 1);
      INSERT INTO session_exercises VALUES ('e1', 's1', 'c1', 'Squat', 'squat', 0, 1, 1);
    `);

    sqlite(versionOneDatabase, MIGRATION_V2);

    expect(sqlite(versionOneDatabase, 'PRAGMA user_version;')).toBe('2');
    expect(sqlite(versionOneDatabase, 'SELECT COUNT(*) FROM muscle_group_catalog;')).toBe('11');
    expect(sqlite(versionOneDatabase, `
      SELECT display_name || ':' || COALESCE(muscle_group_id, 'none')
      FROM session_exercises WHERE id = 'e1';
    `)).toBe('Squat:none');
  });

  test('persists complete history across connections and cascades deletion', () => {
    sqlite(database, `
      INSERT INTO sessions VALUES ('s1', 'Monday Session', 1, '2026-08-03', -330, 1, 1);
      INSERT INTO exercise_catalog
        (id, normalized_name, display_name, use_count, last_used_at, created_at, updated_at, muscle_group_id)
      VALUES ('c1', 'squat', 'Squat', 1, 1, 1, 1, 'muscle-quadriceps');
      INSERT INTO session_exercises
        (id, session_id, catalog_id, display_name, normalized_name, position, created_at, updated_at, muscle_group_id)
      VALUES ('e1', 's1', 'c1', 'Squat', 'squat', 0, 1, 1, 'muscle-quadriceps');
      INSERT INTO workout_sets VALUES ('w1', 'e1', 0, 5, 100, 'kg', 100, 220.462, 18, 1, 1);
    `);
    expect(sqlite(database, 'SELECT reps || ":" || weight_kg FROM workout_sets WHERE id = "w1";')).toBe('5:100.0');
    sqlite(database, "DELETE FROM sessions WHERE id = 's1';");
    expect(sqlite(database, 'SELECT COUNT(*) FROM session_exercises;')).toBe('0');
    expect(sqlite(database, 'SELECT COUNT(*) FROM workout_sets;')).toBe('0');
    expect(sqlite(database, 'SELECT COUNT(*) FROM exercise_catalog;')).toBe('1');
  });

  test('rolls back failed transactions and enforces session duplicates', () => {
    sqlite(database, "INSERT INTO sessions VALUES ('s1', 'Session', 1, '2026-08-03', -330, 1, 1);");
    expect(() => sqlite(database, `
      BEGIN;
      INSERT INTO session_exercises
        (id, session_id, catalog_id, display_name, normalized_name, position, created_at, updated_at)
      VALUES ('e1', 's1', NULL, 'Squat', 'squat', 0, 1, 1);
      INSERT INTO session_exercises
        (id, session_id, catalog_id, display_name, normalized_name, position, created_at, updated_at)
      VALUES ('e2', 's1', NULL, 'SQUAT', 'squat', 1, 1, 1);
      COMMIT;
    `)).toThrow();
    expect(sqlite(database, 'SELECT COUNT(*) FROM session_exercises;')).toBe('0');
  });

  test('orders prefix catalog matches before more recent contains matches', () => {
    sqlite(database, `
      INSERT INTO exercise_catalog
        (id, normalized_name, display_name, use_count, last_used_at, created_at, updated_at)
      VALUES ('c1', 'bench press', 'Bench Press', 4, 10, 1, 1);
      INSERT INTO exercise_catalog
        (id, normalized_name, display_name, use_count, last_used_at, created_at, updated_at)
      VALUES ('c2', 'bench row', 'Bench Row', 2, 50, 1, 1);
      INSERT INTO exercise_catalog
        (id, normalized_name, display_name, use_count, last_used_at, created_at, updated_at)
      VALUES ('c3', 'incline bench press', 'Incline Bench Press', 8, 1000, 1, 1);
    `);
    const result = sqlite(database, `
      SELECT display_name FROM exercise_catalog
      WHERE instr(normalized_name, 'bench') > 0
      ORDER BY CASE WHEN instr(normalized_name, 'bench') = 1 THEN 0 ELSE 1 END,
               last_used_at DESC, display_name COLLATE NOCASE;
    `);
    expect(result.split('\n')).toEqual(['Bench Row', 'Bench Press', 'Incline Bench Press']);
  });

  test('supports reusable custom muscle groups linked to exercises', () => {
    sqlite(database, `
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
    `);
    expect(sqlite(database, `
      SELECT se.display_name || ':' || mg.display_name
      FROM session_exercises se
      JOIN muscle_group_catalog mg ON mg.id = se.muscle_group_id;
    `)).toBe('External Rotation:Rotator Cuff');
  });

  test('keeps multi-year calendar queries responsive', () => {
    sqlite(database, `
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
      SELECT printf('w%s-%d', se.id, set_numbers.value), se.id, set_numbers.value,
             8, 100, 'kg', 100, 220.462, 20, se.created_at, se.updated_at
      FROM session_exercises se CROSS JOIN set_numbers;
    `);
    const startedAt = performance.now();
    const result = sqlite(database, `
      SELECT COUNT(*), SUM(exercise_count), SUM(set_count) FROM (
        SELECT s.id, COUNT(DISTINCT se.id) AS exercise_count, COUNT(ws.id) AS set_count
        FROM sessions s
        LEFT JOIN session_exercises se ON se.session_id = s.id
        LEFT JOIN workout_sets ws ON ws.exercise_id = se.id
        WHERE s.local_date BETWEEN '2024-01-01' AND '2024-01-31'
        GROUP BY s.id
      );
    `);
    expect(result).toBe('31|93|465');
    expect(performance.now() - startedAt).toBeLessThan(3000);
  });
});
