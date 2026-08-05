import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { Session, SessionSummary } from '@/types/workout';
import { cleanDisplayName } from '@/utils/names';
import { toLocalDateKey } from '@/utils/dates';

interface SessionRow {
  id: string;
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
  async listBetween(db: SQLiteDatabase, start: string, end: string): Promise<SessionSummary[]> {
    const rows = await db.getAllAsync<SessionSummaryRow>(
      `${summarySelect}
       WHERE s.local_date BETWEEN ? AND ?
       GROUP BY s.id
       ORDER BY s.scheduled_at ASC`,
      start,
      end,
    );
    return rows.map(mapSummary);
  },

  async get(db: SQLiteDatabase, id: string): Promise<Session | null> {
    const row = await db.getFirstAsync<SessionRow>('SELECT * FROM sessions WHERE id = ?', id);
    return row ? mapSession(row) : null;
  },

  async create(db: SQLiteDatabase, name: string, scheduledAt: Date): Promise<Session> {
    const now = Date.now();
    const session: Session = {
      id: randomUUID(),
      name: cleanDisplayName(name),
      scheduledAt: scheduledAt.getTime(),
      localDate: toLocalDateKey(scheduledAt),
      timezoneOffsetMinutes: scheduledAt.getTimezoneOffset(),
      createdAt: now,
      updatedAt: now,
    };
    await db.runAsync(
      `INSERT INTO sessions
       (id, name, scheduled_at, local_date, timezone_offset_minutes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      session.id,
      session.name,
      session.scheduledAt,
      session.localDate,
      session.timezoneOffsetMinutes,
      session.createdAt,
      session.updatedAt,
    );
    return session;
  },

  async update(db: SQLiteDatabase, id: string, name: string, scheduledAt: Date): Promise<void> {
    await db.runAsync(
      `UPDATE sessions SET name = ?, scheduled_at = ?, local_date = ?,
       timezone_offset_minutes = ?, updated_at = ? WHERE id = ?`,
      cleanDisplayName(name),
      scheduledAt.getTime(),
      toLocalDateKey(scheduledAt),
      scheduledAt.getTimezoneOffset(),
      Date.now(),
      id,
    );
  },

  async remove(db: SQLiteDatabase, id: string): Promise<void> {
    await db.runAsync('DELETE FROM sessions WHERE id = ?', id);
  },
};
