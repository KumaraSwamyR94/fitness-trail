import { DatabaseSync } from 'node:sqlite';

import { bmiRepository } from '@/data/bmi-repository';

function createDatabase(): DatabaseSync {
  const database = new DatabaseSync(':memory:');
  database.exec(`
    CREATE TABLE bmi_measurements (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      measured_at INTEGER NOT NULL,
      local_date TEXT NOT NULL,
      timezone_offset_minutes INTEGER NOT NULL,
      input_weight REAL NOT NULL,
      input_weight_unit TEXT NOT NULL,
      weight_kg REAL NOT NULL,
      weight_lb REAL NOT NULL,
      input_height_unit TEXT NOT NULL,
      height_cm REAL NOT NULL,
      age_years INTEGER NOT NULL,
      gender TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  return database;
}

function repositoryDatabase(database: DatabaseSync) {
  return {
    getAllAsync: async (sql: string, ...params: unknown[]) =>
      database.prepare(sql).all(...(params as (string | number | null)[])),
  } as never;
}

function insertMeasurement(
  database: DatabaseSync,
  id: string,
  profileId: string,
  measuredAt: number,
  createdAt: number,
): void {
  database
    .prepare(
      `INSERT INTO bmi_measurements VALUES
       (?, ?, ?, '2026-09-12', -330, 70, 'kg', 70, 154.3234, 'cm', 175, 30,
        'prefer_not_to_say', ?, ?)`,
    )
    .run(id, profileId, measuredAt, createdAt, createdAt);
}

describe('bmiRepository.listPage', () => {
  let database: DatabaseSync;

  beforeEach(() => {
    database = createDatabase();
    insertMeasurement(database, 'newest', 'profile-1', 300, 1);
    insertMeasurement(database, 'tie-z', 'profile-1', 200, 20);
    insertMeasurement(database, 'tie-a', 'profile-1', 200, 20);
    insertMeasurement(database, 'middle', 'profile-1', 200, 10);
    insertMeasurement(database, 'oldest', 'profile-1', 100, 5);
    insertMeasurement(database, 'other-profile', 'profile-2', 400, 30);
  });

  afterEach(() => {
    database.close();
  });

  test('returns stable, profile-scoped pages without gaps or duplicates', async () => {
    const db = repositoryDatabase(database);

    const first = await bmiRepository.listPage(db, 'profile-1', 2);
    const second = await bmiRepository.listPage(db, 'profile-1', 2, first.nextCursor);
    const third = await bmiRepository.listPage(db, 'profile-1', 2, second.nextCursor);

    expect(first.measurements.map((measurement) => measurement.id)).toEqual(['newest', 'tie-z']);
    expect(second.measurements.map((measurement) => measurement.id)).toEqual(['tie-a', 'middle']);
    expect(third.measurements.map((measurement) => measurement.id)).toEqual(['oldest']);
    expect(third.nextCursor).toBeNull();
  });

  test('rejects invalid page sizes', async () => {
    await expect(
      bmiRepository.listPage(repositoryDatabase(database), 'profile-1', 0),
    ).rejects.toThrow('positive integer');
  });

  test('continues from a cursor after its measurement is deleted', async () => {
    const db = repositoryDatabase(database);
    const first = await bmiRepository.listPage(db, 'profile-1', 2);

    database.prepare('DELETE FROM bmi_measurements WHERE id = ?').run('tie-z');
    const second = await bmiRepository.listPage(db, 'profile-1', 2, first.nextCursor);

    expect(second.measurements.map((measurement) => measurement.id)).toEqual(['tie-a', 'middle']);
  });
});
