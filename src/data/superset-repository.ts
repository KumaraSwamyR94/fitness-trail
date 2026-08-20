import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { DataConflictError } from '@/data/errors';
import { exerciseRepository } from '@/data/exercise-repository';
import { upsertMuscleGroup } from '@/data/muscle-group-repository';
import type {
  ExerciseSummary,
  ExerciseType,
  SessionExercise,
  SessionWorkoutItem,
  SetKind,
  Superset,
  SupersetDetails,
  SupersetInput,
  SupersetMemberInput,
  SupersetRound,
  SupersetRoundEntry,
  SupersetRoundEntryStatus,
  SupersetRoundStatus,
  SupersetTemplate,
  SupersetTemplateMember,
  WeightUnit,
  WorkoutSet,
} from '@/types/workout';
import { cleanDisplayName, normalizeName, validateName } from '@/utils/names';

interface SupersetRow {
  id: string;
  session_id: string;
  template_id: string | null;
  name: string;
  created_at: number;
  updated_at: number;
  completed_round_count: number;
  pending_entry_count: number;
  set_count: number;
}

interface TemplateRow {
  id: string;
  profile_id: string;
  name: string;
  created_at: number;
  updated_at: number;
}

interface TemplateMemberRow {
  id: string;
  template_id: string;
  catalog_id: string | null;
  display_name: string;
  normalized_name: string;
  muscle_group_id: string | null;
  muscle_group_name: string | null;
  exercise_type: ExerciseType;
  position: number;
}

interface RoundRow {
  id: string;
  superset_id: string;
  position: number;
  status: SupersetRoundStatus;
  completed_at: number | null;
  created_at: number;
  updated_at: number;
}

interface EntryRow {
  id: string;
  round_id: string;
  exercise_id: string;
  position: number;
  status: SupersetRoundEntryStatus;
  workout_set_id: string | null;
  created_at: number;
  updated_at: number;
}

interface ResolvedExerciseRow {
  id: string;
  session_id: string;
  catalog_id: string | null;
  display_name: string;
  normalized_name: string;
  muscle_group_id: string | null;
  muscle_group_name: string | null;
  exercise_type: ExerciseType;
  position: number;
  created_at: number;
  updated_at: number;
  superset_id: string | null;
}

interface SetRow {
  id: string;
  exercise_id: string;
  position: number;
  set_kind: SetKind;
  reps: number | null;
  input_weight: number | null;
  input_unit: WeightUnit | null;
  weight_kg: number | null;
  weight_lb: number | null;
  tut_seconds: number | null;
  duration_seconds: number | null;
  calories: number | null;
  created_at: number;
  updated_at: number;
}

function mapSet(row: SetRow): WorkoutSet {
  const base = {
    id: row.id,
    exerciseId: row.exercise_id,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (row.set_kind === 'duration' && row.duration_seconds !== null)
    return { ...base, kind: 'duration', durationSeconds: row.duration_seconds };
  if (row.set_kind === 'calories' && row.calories !== null)
    return { ...base, kind: 'calories', calories: row.calories };
  if (
    row.set_kind === 'strength' &&
    row.reps !== null &&
    row.input_unit &&
    row.tut_seconds !== null
  ) {
    return {
      ...base,
      kind: 'strength',
      reps: row.reps,
      inputWeight: row.input_weight,
      inputUnit: row.input_unit,
      weightKg: row.weight_kg,
      weightLb: row.weight_lb,
      tutSeconds: row.tut_seconds,
    };
  }
  throw new Error(`Set ${row.id} contains invalid data.`);
}

function mapTemplateMember(row: TemplateMemberRow): SupersetTemplateMember {
  return {
    id: row.id,
    templateId: row.template_id,
    catalogId: row.catalog_id,
    displayName: row.display_name,
    normalizedName: row.normalized_name,
    muscleGroupId: row.muscle_group_id,
    muscleGroupName: row.muscle_group_name,
    exerciseType: row.exercise_type,
    position: row.position,
  };
}

async function assertSessionOwned(
  db: SQLiteDatabase,
  profileId: string,
  sessionId: string,
): Promise<void> {
  const row = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM sessions WHERE id = ? AND profile_id = ?',
    sessionId,
    profileId,
  );
  if (!row) throw new Error('Session not found.');
}

async function defaultName(db: SQLiteDatabase, sessionId: string): Promise<string> {
  const rows = await db.getAllAsync<{ name: string }>(
    "SELECT name FROM supersets WHERE session_id = ? AND name LIKE 'Superset %'",
    sessionId,
  );
  const numbers = rows
    .map(({ name }) => Number(name.match(/^Superset (\d+)$/)?.[1]))
    .filter(Number.isInteger);
  return `Superset ${Math.max(0, ...numbers) + 1}`;
}

async function upsertCatalog(
  db: SQLiteDatabase,
  member: SupersetMemberInput,
  muscleGroupId: string | null,
): Promise<string> {
  const displayName = cleanDisplayName(member.displayName);
  const normalizedName = normalizeName(member.displayName);
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO exercise_catalog
      (id, normalized_name, display_name, muscle_group_id, exercise_type, use_count,
       last_used_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
     ON CONFLICT(normalized_name) DO UPDATE SET
       display_name = excluded.display_name,
       muscle_group_id = excluded.muscle_group_id,
       exercise_type = excluded.exercise_type,
       use_count = exercise_catalog.use_count + 1,
       last_used_at = excluded.last_used_at,
       updated_at = excluded.updated_at`,
    randomUUID(),
    normalizedName,
    displayName,
    muscleGroupId,
    member.exerciseType,
    now,
    now,
    now,
  );
  const row = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM exercise_catalog WHERE normalized_name = ?',
    normalizedName,
  );
  if (!row) throw new Error('Exercise catalog update failed.');
  return row.id;
}

async function reorderExercises(
  db: SQLiteDatabase,
  sessionId: string,
  orderedIds: string[],
): Promise<void> {
  await db.runAsync(
    'UPDATE session_exercises SET position = -position - 1 WHERE session_id = ?',
    sessionId,
  );
  for (const [position, id] of orderedIds.entries()) {
    await db.runAsync(
      'UPDATE session_exercises SET position = ?, updated_at = ? WHERE id = ? AND session_id = ?',
      position,
      Date.now(),
      id,
      sessionId,
    );
  }
}

async function createTemplate(
  db: SQLiteDatabase,
  profileId: string,
  name: string,
  members: SessionExercise[],
  templateId?: string | null,
): Promise<string> {
  const id = templateId ?? randomUUID();
  const now = Date.now();
  if (templateId) {
    const owned = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM superset_templates WHERE id = ? AND profile_id = ?',
      id,
      profileId,
    );
    if (!owned) throw new Error('Superset template not found.');
    await db.runAsync(
      'UPDATE superset_templates SET name = ?, updated_at = ? WHERE id = ?',
      name,
      now,
      id,
    );
    await db.runAsync('DELETE FROM superset_template_members WHERE template_id = ?', id);
  } else {
    await db.runAsync(
      `INSERT INTO superset_templates (id, profile_id, name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      id,
      profileId,
      name,
      now,
      now,
    );
  }
  for (const [position, member] of members.entries()) {
    await db.runAsync(
      `INSERT INTO superset_template_members
       (id, template_id, catalog_id, display_name, normalized_name, muscle_group_id,
        exercise_type, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      randomUUID(),
      id,
      member.catalogId,
      member.displayName,
      member.normalizedName,
      member.muscleGroupId,
      member.exerciseType,
      position,
    );
  }
  return id;
}

async function loadTemplates(db: SQLiteDatabase, profileId: string): Promise<SupersetTemplate[]> {
  const templates = await db.getAllAsync<TemplateRow>(
    'SELECT * FROM superset_templates WHERE profile_id = ? ORDER BY updated_at DESC, name COLLATE NOCASE',
    profileId,
  );
  const result: SupersetTemplate[] = [];
  for (const template of templates) {
    const members = await db.getAllAsync<TemplateMemberRow>(
      `SELECT stm.*, mg.display_name AS muscle_group_name
       FROM superset_template_members stm
       LEFT JOIN muscle_group_catalog mg ON mg.id = stm.muscle_group_id
       WHERE stm.template_id = ? ORDER BY stm.position`,
      template.id,
    );
    result.push({
      id: template.id,
      profileId: template.profile_id,
      name: template.name,
      members: members.map(mapTemplateMember),
      createdAt: template.created_at,
      updatedAt: template.updated_at,
    });
  }
  return result;
}

export const supersetRepository = {
  async findForExercise(
    db: SQLiteDatabase,
    profileId: string,
    exerciseId: string,
  ): Promise<{ id: string; sessionId: string } | null> {
    const row = await db.getFirstAsync<{ id: string; session_id: string }>(
      `SELECT ss.id, ss.session_id FROM superset_members sm
       JOIN supersets ss ON ss.id = sm.superset_id
       JOIN sessions s ON s.id = ss.session_id
       WHERE sm.exercise_id = ? AND s.profile_id = ?`,
      exerciseId,
      profileId,
    );
    return row ? { id: row.id, sessionId: row.session_id } : null;
  },

  async listSessionItems(
    db: SQLiteDatabase,
    profileId: string,
    sessionId: string,
  ): Promise<SessionWorkoutItem[]> {
    const exercises = await exerciseRepository.listForSession(db, profileId, sessionId);
    const rows = await db.getAllAsync<SupersetRow>(
      `SELECT ss.*,
        COUNT(DISTINCT CASE WHEN sr.status = 'completed' THEN sr.id END) AS completed_round_count,
        COUNT(DISTINCT CASE WHEN sre.status = 'pending' THEN sre.id END) AS pending_entry_count,
        COUNT(DISTINCT ws.id) AS set_count
       FROM supersets ss
       JOIN sessions s ON s.id = ss.session_id
       LEFT JOIN superset_members sm ON sm.superset_id = ss.id
       LEFT JOIN workout_sets ws ON ws.exercise_id = sm.exercise_id
       LEFT JOIN superset_rounds sr ON sr.superset_id = ss.id
       LEFT JOIN superset_round_entries sre ON sre.round_id = sr.id
       WHERE ss.session_id = ? AND s.profile_id = ?
       GROUP BY ss.id`,
      sessionId,
      profileId,
    );
    const groupByExercise = new Map<string, { id: string; position: number }>();
    const membersByGroup = new Map<string, { exercise: ExerciseSummary; position: number }[]>();
    const memberships = await db.getAllAsync<{
      superset_id: string;
      exercise_id: string;
      position: number;
    }>(
      `SELECT sm.superset_id, sm.exercise_id, sm.position
       FROM superset_members sm JOIN supersets ss ON ss.id = sm.superset_id
       WHERE ss.session_id = ? ORDER BY sm.position`,
      sessionId,
    );
    const exerciseMap = new Map(exercises.map((exercise) => [exercise.id, exercise]));
    for (const membership of memberships) {
      const exercise = exerciseMap.get(membership.exercise_id);
      if (!exercise) continue;
      groupByExercise.set(exercise.id, {
        id: membership.superset_id,
        position: membership.position,
      });
      const list = membersByGroup.get(membership.superset_id) ?? [];
      list.push({ exercise, position: membership.position });
      membersByGroup.set(membership.superset_id, list);
    }
    const rowMap = new Map(rows.map((row) => [row.id, row]));
    const emitted = new Set<string>();
    const items: SessionWorkoutItem[] = [];
    for (const exercise of exercises) {
      const membership = groupByExercise.get(exercise.id);
      if (!membership) {
        items.push({ kind: 'exercise', id: exercise.id, exercise });
        continue;
      }
      if (emitted.has(membership.id)) continue;
      const row = rowMap.get(membership.id);
      if (!row) continue;
      emitted.add(row.id);
      const members = (membersByGroup.get(row.id) ?? []).map(({ exercise: member, position }) => ({
        supersetId: row.id,
        exercise: member,
        position,
      }));
      const superset: Superset = {
        id: row.id,
        sessionId: row.session_id,
        templateId: row.template_id,
        name: row.name,
        members,
        completedRoundCount: row.completed_round_count,
        hasPendingEntries: row.pending_entry_count > 0,
        membershipLocked: row.set_count > 0,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
      items.push({ kind: 'superset', id: row.id, superset });
    }
    return items;
  },

  async listUngroupedForSession(
    db: SQLiteDatabase,
    profileId: string,
    sessionId: string,
  ): Promise<ExerciseSummary[]> {
    const exercises = await exerciseRepository.listForSession(db, profileId, sessionId);
    const grouped = await db.getAllAsync<{ exercise_id: string }>(
      `SELECT sm.exercise_id FROM superset_members sm
       JOIN supersets ss ON ss.id = sm.superset_id
       JOIN sessions s ON s.id = ss.session_id
       WHERE ss.session_id = ? AND s.profile_id = ?`,
      sessionId,
      profileId,
    );
    const groupedIds = new Set(grouped.map((row) => row.exercise_id));
    return exercises.filter((exercise) => !groupedIds.has(exercise.id));
  },

  async listTemplates(db: SQLiteDatabase, profileId: string): Promise<SupersetTemplate[]> {
    return loadTemplates(db, profileId);
  },

  async renameTemplate(
    db: SQLiteDatabase,
    profileId: string,
    id: string,
    name: string,
  ): Promise<void> {
    const validation = validateName(name);
    if (validation) throw new Error(validation);
    const result = await db.runAsync(
      'UPDATE superset_templates SET name = ?, updated_at = ? WHERE id = ? AND profile_id = ?',
      cleanDisplayName(name),
      Date.now(),
      id,
      profileId,
    );
    if (!result.changes) throw new Error('Superset template not found.');
  },

  async removeTemplate(db: SQLiteDatabase, profileId: string, id: string): Promise<void> {
    const result = await db.runAsync(
      'DELETE FROM superset_templates WHERE id = ? AND profile_id = ?',
      id,
      profileId,
    );
    if (!result.changes) throw new Error('Superset template not found.');
  },

  async create(
    db: SQLiteDatabase,
    profileId: string,
    sessionId: string,
    input: SupersetInput,
  ): Promise<string> {
    if (input.members.length < 2) throw new Error('Choose at least two exercises.');
    let createdId = '';
    await db.withExclusiveTransactionAsync(async (transaction) => {
      await assertSessionOwned(transaction, profileId, sessionId);
      const name = input.name?.trim()
        ? cleanDisplayName(input.name)
        : await defaultName(transaction, sessionId);
      const validation = validateName(name);
      if (validation) throw new Error(validation);
      if (input.templateId) {
        const ownedTemplate = await transaction.getFirstAsync<{ id: string }>(
          'SELECT id FROM superset_templates WHERE id = ? AND profile_id = ?',
          input.templateId,
          profileId,
        );
        if (!ownedTemplate) throw new Error('Superset template not found.');
      }
      const before = await transaction.getAllAsync<{ id: string }>(
        'SELECT id FROM session_exercises WHERE session_id = ? ORDER BY position',
        sessionId,
      );
      const originalIndex = new Map(before.map((row, index) => [row.id, index]));
      const resolved: SessionExercise[] = [];
      for (const draft of input.members) {
        const displayName = cleanDisplayName(draft.displayName);
        const normalizedName = normalizeName(draft.displayName);
        if (validateName(displayName)) throw new Error('Every exercise needs a valid name.');
        let exerciseRow = draft.existingExerciseId
          ? await transaction.getFirstAsync<ResolvedExerciseRow>(
              `SELECT se.*, mg.display_name AS muscle_group_name, sm.superset_id
               FROM session_exercises se
               JOIN sessions s ON s.id = se.session_id
               LEFT JOIN muscle_group_catalog mg ON mg.id = se.muscle_group_id
               LEFT JOIN superset_members sm ON sm.exercise_id = se.id
               WHERE se.id = ? AND se.session_id = ? AND s.profile_id = ?`,
              draft.existingExerciseId,
              sessionId,
              profileId,
            )
          : await transaction.getFirstAsync<ResolvedExerciseRow>(
              `SELECT se.*, mg.display_name AS muscle_group_name, sm.superset_id
               FROM session_exercises se
               LEFT JOIN muscle_group_catalog mg ON mg.id = se.muscle_group_id
               LEFT JOIN superset_members sm ON sm.exercise_id = se.id
               WHERE se.session_id = ? AND se.normalized_name = ?`,
              sessionId,
              normalizedName,
            );
        if (exerciseRow?.superset_id)
          throw new DataConflictError(`${exerciseRow.display_name} is already in a superset.`);
        if (!exerciseRow) {
          if (draft.exerciseType !== 'cardio' && !draft.muscleGroupName.trim())
            throw new Error(`Choose a muscle group for ${displayName}.`);
          const muscleGroup = draft.muscleGroupName.trim()
            ? await upsertMuscleGroup(transaction, draft.muscleGroupName)
            : null;
          const catalogId = await upsertCatalog(transaction, draft, muscleGroup?.id ?? null);
          const next = await transaction.getFirstAsync<{ position: number }>(
            'SELECT COALESCE(MAX(position), -1) + 1 AS position FROM session_exercises WHERE session_id = ?',
            sessionId,
          );
          const now = Date.now();
          const id = randomUUID();
          await transaction.runAsync(
            `INSERT INTO session_exercises
             (id, session_id, catalog_id, display_name, normalized_name, muscle_group_id,
              exercise_type, position, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            id,
            sessionId,
            catalogId,
            displayName,
            normalizedName,
            muscleGroup?.id ?? null,
            draft.exerciseType,
            next?.position ?? 0,
            now,
            now,
          );
          exerciseRow = {
            id,
            session_id: sessionId,
            catalog_id: catalogId,
            display_name: displayName,
            normalized_name: normalizedName,
            muscle_group_id: muscleGroup?.id ?? null,
            muscle_group_name: muscleGroup?.displayName ?? null,
            exercise_type: draft.exerciseType,
            position: next?.position ?? 0,
            created_at: now,
            updated_at: now,
            superset_id: null,
          };
        }
        if (resolved.some((exercise) => exercise.id === exerciseRow.id))
          throw new DataConflictError(`${exerciseRow.display_name} is selected more than once.`);
        resolved.push({
          id: exerciseRow.id,
          sessionId: exerciseRow.session_id,
          catalogId: exerciseRow.catalog_id,
          displayName: exerciseRow.display_name,
          normalizedName: exerciseRow.normalized_name,
          muscleGroupId: exerciseRow.muscle_group_id,
          muscleGroupName: exerciseRow.muscle_group_name,
          exerciseType: exerciseRow.exercise_type,
          position: exerciseRow.position,
          createdAt: exerciseRow.created_at,
          updatedAt: exerciseRow.updated_at,
        });
      }
      const resolvedIds = new Set(resolved.map((exercise) => exercise.id));
      const latest = await transaction.getAllAsync<{ id: string }>(
        'SELECT id FROM session_exercises WHERE session_id = ? ORDER BY position',
        sessionId,
      );
      const remaining = latest.map((row) => row.id).filter((id) => !resolvedIds.has(id));
      const selectedOriginalPositions = resolved
        .map((exercise) => originalIndex.get(exercise.id))
        .filter((position): position is number => position !== undefined);
      const insertion = selectedOriginalPositions.length
        ? Math.min(...selectedOriginalPositions)
        : remaining.length;
      remaining.splice(insertion, 0, ...resolved.map((exercise) => exercise.id));
      await reorderExercises(transaction, sessionId, remaining);

      const supersetId = randomUUID();
      const now = Date.now();
      let templateId = input.templateId ?? null;
      if (input.saveAsTemplate)
        templateId = await createTemplate(
          transaction,
          profileId,
          name,
          resolved,
          input.templateId ?? null,
        );
      await transaction.runAsync(
        `INSERT INTO supersets (id, session_id, template_id, name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        supersetId,
        sessionId,
        templateId,
        name,
        now,
        now,
      );
      for (const [position, exercise] of resolved.entries()) {
        await transaction.runAsync(
          `INSERT INTO superset_members (superset_id, exercise_id, position, created_at)
           VALUES (?, ?, ?, ?)`,
          supersetId,
          exercise.id,
          position,
          now,
        );
      }
      const setsByExercise = new Map<string, { id: string }[]>();
      let maxSets = 0;
      for (const exercise of resolved) {
        const sets = await transaction.getAllAsync<{ id: string }>(
          'SELECT id FROM workout_sets WHERE exercise_id = ? ORDER BY position',
          exercise.id,
        );
        setsByExercise.set(exercise.id, sets);
        maxSets = Math.max(maxSets, sets.length);
      }
      for (let roundPosition = 0; roundPosition < maxSets; roundPosition += 1) {
        const roundId = randomUUID();
        const complete = resolved.every(
          (exercise) => setsByExercise.get(exercise.id)?.[roundPosition],
        );
        await transaction.runAsync(
          `INSERT INTO superset_rounds
           (id, superset_id, position, status, completed_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          roundId,
          supersetId,
          roundPosition,
          complete ? 'completed' : 'in_progress',
          complete ? now : null,
          now,
          now,
        );
        for (const [position, exercise] of resolved.entries()) {
          const workoutSetId = setsByExercise.get(exercise.id)?.[roundPosition]?.id ?? null;
          await transaction.runAsync(
            `INSERT INTO superset_round_entries
             (id, round_id, exercise_id, position, status, workout_set_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            randomUUID(),
            roundId,
            exercise.id,
            position,
            workoutSetId ? 'completed' : 'pending',
            workoutSetId,
            now,
            now,
          );
        }
      }
      createdId = supersetId;
    });
    return createdId;
  },

  async updateMembers(
    db: SQLiteDatabase,
    profileId: string,
    id: string,
    input: SupersetInput,
  ): Promise<void> {
    if (input.members.length < 2) throw new Error('Choose at least two exercises.');
    await db.withExclusiveTransactionAsync(async (transaction) => {
      const group = await transaction.getFirstAsync<{
        session_id: string;
        template_id: string | null;
      }>(
        `SELECT ss.session_id, ss.template_id FROM supersets ss
         JOIN sessions s ON s.id = ss.session_id
         WHERE ss.id = ? AND s.profile_id = ?`,
        id,
        profileId,
      );
      if (!group) throw new Error('Superset not found.');
      const setCount = await transaction.getFirstAsync<{ count: number }>(
        `SELECT COUNT(ws.id) AS count FROM workout_sets ws
         JOIN superset_members sm ON sm.exercise_id = ws.exercise_id
         WHERE sm.superset_id = ?`,
        id,
      );
      if (setCount?.count)
        throw new DataConflictError('Members are locked after set logging begins.');
      const name = input.name?.trim()
        ? cleanDisplayName(input.name)
        : await defaultName(transaction, group.session_id);
      const validation = validateName(name);
      if (validation) throw new Error(validation);
      if (input.templateId) {
        const ownedTemplate = await transaction.getFirstAsync<{ id: string }>(
          'SELECT id FROM superset_templates WHERE id = ? AND profile_id = ?',
          input.templateId,
          profileId,
        );
        if (!ownedTemplate) throw new Error('Superset template not found.');
      }
      const before = await transaction.getAllAsync<{ id: string }>(
        'SELECT id FROM session_exercises WHERE session_id = ? ORDER BY position',
        group.session_id,
      );
      const originalIndex = new Map(before.map((row, index) => [row.id, index]));
      const resolved: SessionExercise[] = [];
      for (const draft of input.members) {
        const displayName = cleanDisplayName(draft.displayName);
        const normalizedName = normalizeName(draft.displayName);
        let row = await transaction.getFirstAsync<ResolvedExerciseRow>(
          `SELECT se.*, mg.display_name AS muscle_group_name, sm.superset_id
           FROM session_exercises se
           LEFT JOIN muscle_group_catalog mg ON mg.id = se.muscle_group_id
           LEFT JOIN superset_members sm ON sm.exercise_id = se.id
           WHERE se.session_id = ? AND ${draft.existingExerciseId ? 'se.id = ?' : 'se.normalized_name = ?'}`,
          group.session_id,
          draft.existingExerciseId ?? normalizedName,
        );
        if (row?.superset_id && row.superset_id !== id)
          throw new DataConflictError(`${row.display_name} is already in another superset.`);
        if (!row) {
          if (draft.exerciseType !== 'cardio' && !draft.muscleGroupName.trim())
            throw new Error(`Choose a muscle group for ${displayName}.`);
          const muscleGroup = draft.muscleGroupName.trim()
            ? await upsertMuscleGroup(transaction, draft.muscleGroupName)
            : null;
          const catalogId = await upsertCatalog(transaction, draft, muscleGroup?.id ?? null);
          const next = await transaction.getFirstAsync<{ position: number }>(
            'SELECT COALESCE(MAX(position), -1) + 1 AS position FROM session_exercises WHERE session_id = ?',
            group.session_id,
          );
          const now = Date.now();
          const exerciseId = randomUUID();
          await transaction.runAsync(
            `INSERT INTO session_exercises
             (id, session_id, catalog_id, display_name, normalized_name, muscle_group_id,
              exercise_type, position, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            exerciseId,
            group.session_id,
            catalogId,
            displayName,
            normalizedName,
            muscleGroup?.id ?? null,
            draft.exerciseType,
            next?.position ?? 0,
            now,
            now,
          );
          row = {
            id: exerciseId,
            session_id: group.session_id,
            catalog_id: catalogId,
            display_name: displayName,
            normalized_name: normalizedName,
            muscle_group_id: muscleGroup?.id ?? null,
            muscle_group_name: muscleGroup?.displayName ?? null,
            exercise_type: draft.exerciseType,
            position: next?.position ?? 0,
            created_at: now,
            updated_at: now,
            superset_id: null,
          };
        }
        if (resolved.some((exercise) => exercise.id === row.id))
          throw new DataConflictError(`${row.display_name} is selected more than once.`);
        resolved.push({
          id: row.id,
          sessionId: row.session_id,
          catalogId: row.catalog_id,
          displayName: row.display_name,
          normalizedName: row.normalized_name,
          muscleGroupId: row.muscle_group_id,
          muscleGroupName: row.muscle_group_name,
          exerciseType: row.exercise_type,
          position: row.position,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        });
      }
      const resolvedIds = new Set(resolved.map((exercise) => exercise.id));
      const latest = await transaction.getAllAsync<{ id: string }>(
        'SELECT id FROM session_exercises WHERE session_id = ? ORDER BY position',
        group.session_id,
      );
      const remaining = latest
        .map((row) => row.id)
        .filter((exerciseId) => !resolvedIds.has(exerciseId));
      const selectedPositions = resolved
        .map((exercise) => originalIndex.get(exercise.id))
        .filter((position): position is number => position !== undefined);
      remaining.splice(
        selectedPositions.length ? Math.min(...selectedPositions) : remaining.length,
        0,
        ...resolved.map((exercise) => exercise.id),
      );
      await reorderExercises(transaction, group.session_id, remaining);
      await transaction.runAsync('DELETE FROM superset_rounds WHERE superset_id = ?', id);
      await transaction.runAsync('DELETE FROM superset_members WHERE superset_id = ?', id);
      const now = Date.now();
      for (const [position, exercise] of resolved.entries()) {
        await transaction.runAsync(
          'INSERT INTO superset_members (superset_id, exercise_id, position, created_at) VALUES (?, ?, ?, ?)',
          id,
          exercise.id,
          position,
          now,
        );
      }
      let templateId = group.template_id;
      if (input.saveAsTemplate)
        templateId = await createTemplate(
          transaction,
          profileId,
          name,
          resolved,
          input.templateId ?? null,
        );
      await transaction.runAsync(
        'UPDATE supersets SET name = ?, template_id = ?, updated_at = ? WHERE id = ?',
        name,
        templateId,
        now,
        id,
      );
    });
  },

  async getDetails(
    db: SQLiteDatabase,
    profileId: string,
    id: string,
  ): Promise<SupersetDetails | null> {
    const row = await db.getFirstAsync<{ session_id: string }>(
      `SELECT ss.session_id FROM supersets ss JOIN sessions s ON s.id = ss.session_id
       WHERE ss.id = ? AND s.profile_id = ?`,
      id,
      profileId,
    );
    if (!row) return null;
    const item = (await this.listSessionItems(db, profileId, row.session_id)).find(
      (candidate) => candidate.kind === 'superset' && candidate.id === id,
    );
    if (!item || item.kind !== 'superset') return null;
    const exerciseById = new Map(
      item.superset.members.map((member) => [member.exercise.id, member.exercise]),
    );
    const rounds = await db.getAllAsync<RoundRow>(
      'SELECT * FROM superset_rounds WHERE superset_id = ? ORDER BY position',
      id,
    );
    const mappedRounds: SupersetRound[] = [];
    for (const round of rounds) {
      const entries = await db.getAllAsync<EntryRow>(
        'SELECT * FROM superset_round_entries WHERE round_id = ? ORDER BY position',
        round.id,
      );
      const mappedEntries: SupersetRoundEntry[] = [];
      for (const entry of entries) {
        const exercise = exerciseById.get(entry.exercise_id);
        if (!exercise) continue;
        const setRow = entry.workout_set_id
          ? await db.getFirstAsync<SetRow>(
              'SELECT * FROM workout_sets WHERE id = ?',
              entry.workout_set_id,
            )
          : null;
        mappedEntries.push({
          id: entry.id,
          roundId: entry.round_id,
          exercise,
          position: entry.position,
          status: entry.status,
          workoutSet: setRow ? mapSet(setRow) : null,
          createdAt: entry.created_at,
          updatedAt: entry.updated_at,
        });
      }
      mappedRounds.push({
        id: round.id,
        supersetId: round.superset_id,
        position: round.position,
        status: round.status,
        entries: mappedEntries,
        createdAt: round.created_at,
        updatedAt: round.updated_at,
        completedAt: round.completed_at,
      });
    }
    return { ...item.superset, rounds: mappedRounds };
  },

  async startRound(db: SQLiteDatabase, profileId: string, id: string): Promise<string> {
    let firstEntryId = '';
    await db.withExclusiveTransactionAsync(async (transaction) => {
      const superset = await transaction.getFirstAsync<{ session_id: string }>(
        `SELECT ss.session_id FROM supersets ss JOIN sessions s ON s.id = ss.session_id
         WHERE ss.id = ? AND s.profile_id = ?`,
        id,
        profileId,
      );
      if (!superset) throw new Error('Superset not found.');
      const pending = await transaction.getFirstAsync<{ id: string }>(
        `SELECT sre.id FROM superset_round_entries sre
         JOIN superset_rounds sr ON sr.id = sre.round_id
         WHERE sr.superset_id = ? AND sre.status = 'pending'
         ORDER BY sr.position, sre.position LIMIT 1`,
        id,
      );
      if (pending) throw new DataConflictError('Finish or skip every pending exercise first.');
      const next = await transaction.getFirstAsync<{ position: number }>(
        'SELECT COALESCE(MAX(position), -1) + 1 AS position FROM superset_rounds WHERE superset_id = ?',
        id,
      );
      const members = await transaction.getAllAsync<{ exercise_id: string; position: number }>(
        'SELECT exercise_id, position FROM superset_members WHERE superset_id = ? ORDER BY position',
        id,
      );
      if (members.length < 2) throw new Error('A superset needs at least two exercises.');
      const now = Date.now();
      const roundId = randomUUID();
      await transaction.runAsync(
        `INSERT INTO superset_rounds
         (id, superset_id, position, status, completed_at, created_at, updated_at)
         VALUES (?, ?, ?, 'in_progress', NULL, ?, ?)`,
        roundId,
        id,
        next?.position ?? 0,
        now,
        now,
      );
      for (const member of members) {
        const entryId = randomUUID();
        if (!firstEntryId) firstEntryId = entryId;
        await transaction.runAsync(
          `INSERT INTO superset_round_entries
           (id, round_id, exercise_id, position, status, workout_set_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'pending', NULL, ?, ?)`,
          entryId,
          roundId,
          member.exercise_id,
          member.position,
          now,
          now,
        );
      }
    });
    return firstEntryId;
  },

  async nextPendingEntry(
    db: SQLiteDatabase,
    profileId: string,
    supersetId: string,
  ): Promise<string | null> {
    const row = await db.getFirstAsync<{ id: string }>(
      `SELECT sre.id FROM superset_round_entries sre
       JOIN superset_rounds sr ON sr.id = sre.round_id
       JOIN supersets ss ON ss.id = sr.superset_id
       JOIN sessions s ON s.id = ss.session_id
       WHERE ss.id = ? AND s.profile_id = ? AND sre.status = 'pending'
       ORDER BY sr.position, sre.position LIMIT 1`,
      supersetId,
      profileId,
    );
    return row?.id ?? null;
  },

  async skipEntry(db: SQLiteDatabase, profileId: string, entryId: string): Promise<string | null> {
    let supersetId = '';
    await db.withExclusiveTransactionAsync(async (transaction) => {
      const entry = await transaction.getFirstAsync<{ round_id: string; superset_id: string }>(
        `SELECT sre.round_id, sr.superset_id FROM superset_round_entries sre
         JOIN superset_rounds sr ON sr.id = sre.round_id
         JOIN supersets ss ON ss.id = sr.superset_id
         JOIN sessions s ON s.id = ss.session_id
         WHERE sre.id = ? AND s.profile_id = ?`,
        entryId,
        profileId,
      );
      if (!entry) throw new Error('Round entry not found.');
      supersetId = entry.superset_id;
      await transaction.runAsync(
        `UPDATE superset_round_entries SET status = 'skipped', workout_set_id = NULL, updated_at = ?
         WHERE id = ? AND status IN ('pending', 'skipped')`,
        Date.now(),
        entryId,
      );
      const pending = await transaction.getFirstAsync<{ count: number }>(
        "SELECT COUNT(*) AS count FROM superset_round_entries WHERE round_id = ? AND status = 'pending'",
        entry.round_id,
      );
      if (!pending?.count) {
        const now = Date.now();
        await transaction.runAsync(
          `UPDATE superset_rounds SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ?`,
          now,
          now,
          entry.round_id,
        );
      }
    });
    return this.nextPendingEntry(db, profileId, supersetId);
  },

  async rename(db: SQLiteDatabase, profileId: string, id: string, name: string): Promise<void> {
    const validation = validateName(name);
    if (validation) throw new Error(validation);
    const result = await db.runAsync(
      `UPDATE supersets SET name = ?, updated_at = ? WHERE id = ? AND session_id IN
       (SELECT id FROM sessions WHERE profile_id = ?)`,
      cleanDisplayName(name),
      Date.now(),
      id,
      profileId,
    );
    if (!result.changes) throw new Error('Superset not found.');
  },

  async dissolve(db: SQLiteDatabase, profileId: string, id: string): Promise<void> {
    const result = await db.runAsync(
      `DELETE FROM supersets WHERE id = ? AND session_id IN
       (SELECT id FROM sessions WHERE profile_id = ?)`,
      id,
      profileId,
    );
    if (!result.changes) throw new Error('Superset not found.');
  },

  async remove(db: SQLiteDatabase, profileId: string, id: string): Promise<void> {
    await db.withExclusiveTransactionAsync(async (transaction) => {
      const owned = await transaction.getFirstAsync<{ id: string; session_id: string }>(
        `SELECT ss.id, ss.session_id FROM supersets ss JOIN sessions s ON s.id = ss.session_id
         WHERE ss.id = ? AND s.profile_id = ?`,
        id,
        profileId,
      );
      if (!owned) throw new Error('Superset not found.');
      const members = await transaction.getAllAsync<{ exercise_id: string }>(
        'SELECT exercise_id FROM superset_members WHERE superset_id = ?',
        id,
      );
      for (const member of members)
        await transaction.runAsync(
          'DELETE FROM session_exercises WHERE id = ?',
          member.exercise_id,
        );
      await transaction.runAsync('DELETE FROM supersets WHERE id = ?', id);
      const remaining = await transaction.getAllAsync<{ id: string }>(
        'SELECT id FROM session_exercises WHERE session_id = ? ORDER BY position, created_at',
        owned.session_id,
      );
      await reorderExercises(
        transaction,
        owned.session_id,
        remaining.map((exercise) => exercise.id),
      );
    });
  },

  async reorderSessionItems(
    db: SQLiteDatabase,
    profileId: string,
    sessionId: string,
    itemIds: string[],
  ): Promise<void> {
    await db.withExclusiveTransactionAsync(async (transaction) => {
      await assertSessionOwned(transaction, profileId, sessionId);
      const orderedExerciseIds: string[] = [];
      for (const itemId of itemIds) {
        const members = await transaction.getAllAsync<{ exercise_id: string }>(
          `SELECT sm.exercise_id FROM superset_members sm
           JOIN supersets ss ON ss.id = sm.superset_id
           WHERE sm.superset_id = ? AND ss.session_id = ? ORDER BY sm.position`,
          itemId,
          sessionId,
        );
        if (members.length) orderedExerciseIds.push(...members.map((member) => member.exercise_id));
        else {
          const exercise = await transaction.getFirstAsync<{ id: string }>(
            'SELECT id FROM session_exercises WHERE id = ? AND session_id = ?',
            itemId,
            sessionId,
          );
          if (exercise) orderedExerciseIds.push(exercise.id);
        }
      }
      const count = await transaction.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) AS count FROM session_exercises WHERE session_id = ?',
        sessionId,
      );
      if (orderedExerciseIds.length !== count?.count)
        throw new Error('Session item order is incomplete.');
      await reorderExercises(transaction, sessionId, orderedExerciseIds);
    });
  },
};
