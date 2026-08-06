import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { MuscleGroupCatalogEntry } from '@/types/workout';
import { cleanDisplayName, normalizeName } from '@/utils/names';

interface MuscleGroupRow {
  id: string;
  normalized_name: string;
  display_name: string;
  is_predefined: number;
  use_count: number;
  last_used_at: number;
}

function mapMuscleGroup(row: MuscleGroupRow): MuscleGroupCatalogEntry {
  return {
    id: row.id,
    normalizedName: row.normalized_name,
    displayName: row.display_name,
    isPredefined: row.is_predefined === 1,
    useCount: row.use_count,
    lastUsedAt: row.last_used_at,
  };
}

export async function upsertMuscleGroup(
  db: SQLiteDatabase,
  name: string,
): Promise<MuscleGroupCatalogEntry> {
  const displayName = cleanDisplayName(name);
  const normalizedName = normalizeName(name);
  if (!displayName) throw new Error('Choose a muscle group.');

  const now = Date.now();
  await db.runAsync(
    `INSERT INTO muscle_group_catalog
      (id, normalized_name, display_name, is_predefined, use_count, last_used_at, created_at, updated_at)
     VALUES (?, ?, ?, 0, 1, ?, ?, ?)
     ON CONFLICT(normalized_name) DO UPDATE SET
       use_count = muscle_group_catalog.use_count + 1,
       last_used_at = excluded.last_used_at,
       updated_at = excluded.updated_at`,
    randomUUID(),
    normalizedName,
    displayName,
    now,
    now,
    now,
  );
  const row = await db.getFirstAsync<MuscleGroupRow>(
    `SELECT id, normalized_name, display_name, is_predefined, use_count, last_used_at
     FROM muscle_group_catalog WHERE normalized_name = ?`,
    normalizedName,
  );
  if (!row) throw new Error('Muscle group update failed.');
  return mapMuscleGroup(row);
}

export const muscleGroupRepository = {
  async searchCatalog(
    db: SQLiteDatabase,
    query: string,
    limit = 30,
  ): Promise<MuscleGroupCatalogEntry[]> {
    const normalized = normalizeName(query);
    const rows = await db.getAllAsync<MuscleGroupRow>(
      `SELECT id, normalized_name, display_name, is_predefined, use_count, last_used_at
       FROM muscle_group_catalog
       WHERE ? = '' OR instr(normalized_name, ?) > 0
       ORDER BY CASE WHEN ? <> '' AND instr(normalized_name, ?) = 1 THEN 0 ELSE 1 END,
                CASE WHEN ? = '' THEN is_predefined ELSE 0 END DESC,
                CASE WHEN ? = '' THEN display_name END COLLATE NOCASE,
                last_used_at DESC, display_name COLLATE NOCASE
       LIMIT ?`,
      normalized,
      normalized,
      normalized,
      normalized,
      normalized,
      normalized,
      limit,
    );
    return rows.map(mapMuscleGroup);
  },
};
