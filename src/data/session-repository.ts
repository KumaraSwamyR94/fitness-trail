import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { Session, SessionSummary } from '@/types/workout';
import { toLocalDateKey } from '@/utils/dates';
import { cleanDisplayName } from '@/utils/names';

interface SessionRow {
  id: string;
  profile_id: string;
  name: string;
  scheduled_at: number;
  local_date: string;
  timezone_offset_minutes: number;
  created_at: number;
  updated_at: number;
}

interface SessionSummaryRow extends SessionRow {
  exercise_count: number;
  set_count: number;
}

function mapSession(row: SessionRow): Session {
  return {
    id: row.id,
    profileId: row.profile_id,
    name: row.name,
    scheduledAt: row.scheduled_at,
    localDate: row.local_date,
    timezoneOffsetMinutes: row.timezone_offset_minutes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSummary(row: SessionSummaryRow): SessionSummary {
  return {
    ...mapSession(row),
    exerciseCount: row.exercise_count,
    setCount: row.set_count,
  };
}

const summarySelect = `
  SELECT s.*,
    COUNT(DISTINCT se.id) AS exercise_count,
    COUNT(ws.id) AS set_count
  FROM sessions s
  LEFT JOIN session_exercises se ON se.session_id = s.id
  LEFT JOIN workout_sets ws ON ws.exercise_id = se.id
`;

export const sessionRepository = {
  async listBetween(
    db: SQLiteDatabase,
    profileId: string,
    start: string,
    end: string,
  ): Promise<SessionSummary[]> {
    const rows = await db.getAllAsync<SessionSummaryRow>(
      `${summarySelect}
       WHERE s.profile_id = ? AND s.local_date BETWEEN ? AND ?
       GROUP BY s.id
       ORDER BY s.scheduled_at ASC`,
      profileId,
      start,
      end,
    );
    return rows.map(mapSummary);
  },

  async get(db: SQLiteDatabase, profileId: string, id: string): Promise<Session | null> {
    const row = await db.getFirstAsync<SessionRow>(
      'SELECT * FROM sessions WHERE id = ? AND profile_id = ?',
      id,
      profileId,
    );
    return row ? mapSession(row) : null;
  },

  async create(
    db: SQLiteDatabase,
    profileId: string,
    name: string,
    scheduledAt: Date,
  ): Promise<Session> {
    const now = Date.now();
    const session: Session = {
      id: randomUUID(),
      profileId,
      name: cleanDisplayName(name),
      scheduledAt: scheduledAt.getTime(),
      localDate: toLocalDateKey(scheduledAt),
      timezoneOffsetMinutes: scheduledAt.getTimezoneOffset(),
      createdAt: now,
      updatedAt: now,
    };
    await db.runAsync(
      `INSERT INTO sessions
       (id, profile_id, name, scheduled_at, local_date, timezone_offset_minutes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      session.id,
      session.profileId,
      session.name,
      session.scheduledAt,
      session.localDate,
      session.timezoneOffsetMinutes,
      session.createdAt,
      session.updatedAt,
    );
    return session;
  },

  async update(
    db: SQLiteDatabase,
    profileId: string,
    id: string,
    name: string,
    scheduledAt: Date,
  ): Promise<void> {
    const result = await db.runAsync(
      `UPDATE sessions SET name = ?, scheduled_at = ?, local_date = ?,
       timezone_offset_minutes = ?, updated_at = ? WHERE id = ? AND profile_id = ?`,
      cleanDisplayName(name),
      scheduledAt.getTime(),
      toLocalDateKey(scheduledAt),
      scheduledAt.getTimezoneOffset(),
      Date.now(),
      id,
      profileId,
    );
    if (result.changes === 0) throw new Error('Session not found.');
  },

  async remove(db: SQLiteDatabase, profileId: string, id: string): Promise<void> {
    const result = await db.runAsync(
      'DELETE FROM sessions WHERE id = ? AND profile_id = ?',
      id,
      profileId,
    );
    if (result.changes === 0) throw new Error('Session not found.');
  },
};
