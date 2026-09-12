import type { SQLiteDatabase } from 'expo-sqlite';

import type {
  BmiMeasurementTransfer,
  ProfileTransfer,
  SessionExerciseTransfer,
  SessionTransfer,
  TransferData,
  WorkoutSetTransfer,
} from '@/features/data-transfer/schemas';
import type { ExportOptions, TransferCounts } from '@/features/data-transfer/types';

type MuscleGroupTransfer = TransferData['muscleGroups'][number];
type ExerciseCatalogTransfer = TransferData['exerciseCatalog'][number];
type SupersetTemplateTransfer = TransferData['supersetTemplates'][number];
type SupersetTemplateMemberTransfer = TransferData['supersetTemplateMembers'][number];
type SupersetTransfer = TransferData['supersets'][number];
type SupersetMemberTransfer = TransferData['supersetMembers'][number];
type SupersetRoundTransfer = TransferData['supersetRounds'][number];
type SupersetRoundEntryTransfer = TransferData['supersetRoundEntries'][number];

function placeholders(values: unknown[]): string {
  return values.map(() => '?').join(', ');
}

function sessionSelection(
  options: ExportOptions,
  alias = 's',
): { sql: string; params: (string | number | null)[] } {
  const params: (string | number | null)[] = [...options.profileIds];
  let sql = `${alias}.profile_id IN (${placeholders(options.profileIds)})`;
  if (options.dateRange) {
    sql += ` AND ${alias}.local_date BETWEEN ? AND ?`;
    params.push(options.dateRange.start, options.dateRange.end);
  }
  return { sql, params };
}

export async function loadProfilesForExport(
  db: SQLiteDatabase,
  profileIds: string[],
): Promise<ProfileTransfer[]> {
  if (!profileIds.length) return [];
  return db.getAllAsync<ProfileTransfer>(
    `SELECT id, name, age_source, age_years, date_of_birth, gender, input_height_unit,
            height_cm, created_at, updated_at
     FROM profiles WHERE id IN (${placeholders(profileIds)})
     ORDER BY created_at, id`,
    ...profileIds,
  );
}

export async function loadTransferData(
  db: SQLiteDatabase,
  options: ExportOptions,
): Promise<TransferData> {
  const empty: TransferData = {
    muscleGroups: [],
    exerciseCatalog: [],
    sessions: [],
    sessionExercises: [],
    workoutSets: [],
    supersetTemplates: [],
    supersetTemplateMembers: [],
    supersets: [],
    supersetMembers: [],
    supersetRounds: [],
    supersetRoundEntries: [],
    bmiMeasurements: [],
  };
  const includesWorkouts = options.datasets.includes('workouts');
  const includesBmi = options.datasets.includes('bmi');
  const selection = sessionSelection(options);
  const profileSlots = placeholders(options.profileIds);

  const workoutPromise = includesWorkouts
    ? Promise.all([
        db.getAllAsync<SessionTransfer>(
          `SELECT s.* FROM sessions s WHERE ${selection.sql}
           ORDER BY s.scheduled_at, s.created_at, s.id`,
          ...selection.params,
        ),
        db.getAllAsync<SessionExerciseTransfer>(
          `SELECT se.* FROM session_exercises se
           JOIN sessions s ON s.id = se.session_id
           WHERE ${selection.sql}
           ORDER BY s.scheduled_at, se.position, se.id`,
          ...selection.params,
        ),
        db.getAllAsync<WorkoutSetTransfer>(
          `SELECT ws.* FROM workout_sets ws
           JOIN session_exercises se ON se.id = ws.exercise_id
           JOIN sessions s ON s.id = se.session_id
           WHERE ${selection.sql}
           ORDER BY s.scheduled_at, se.position, ws.position, ws.id`,
          ...selection.params,
        ),
        db.getAllAsync<SupersetTemplateTransfer>(
          `SELECT * FROM superset_templates WHERE profile_id IN (${profileSlots})
           ORDER BY profile_id, created_at, id`,
          ...options.profileIds,
        ),
        db.getAllAsync<SupersetTemplateMemberTransfer>(
          `SELECT stm.* FROM superset_template_members stm
           JOIN superset_templates st ON st.id = stm.template_id
           WHERE st.profile_id IN (${profileSlots})
           ORDER BY st.profile_id, stm.template_id, stm.position, stm.id`,
          ...options.profileIds,
        ),
        db.getAllAsync<SupersetTransfer>(
          `SELECT ss.* FROM supersets ss JOIN sessions s ON s.id = ss.session_id
           WHERE ${selection.sql} ORDER BY s.scheduled_at, ss.created_at, ss.id`,
          ...selection.params,
        ),
        db.getAllAsync<SupersetMemberTransfer>(
          `SELECT sm.* FROM superset_members sm
           JOIN supersets ss ON ss.id = sm.superset_id
           JOIN sessions s ON s.id = ss.session_id
           WHERE ${selection.sql} ORDER BY sm.superset_id, sm.position`,
          ...selection.params,
        ),
        db.getAllAsync<SupersetRoundTransfer>(
          `SELECT sr.* FROM superset_rounds sr
           JOIN supersets ss ON ss.id = sr.superset_id
           JOIN sessions s ON s.id = ss.session_id
           WHERE ${selection.sql} ORDER BY sr.superset_id, sr.position, sr.id`,
          ...selection.params,
        ),
        db.getAllAsync<SupersetRoundEntryTransfer>(
          `SELECT sre.* FROM superset_round_entries sre
           JOIN superset_rounds sr ON sr.id = sre.round_id
           JOIN supersets ss ON ss.id = sr.superset_id
           JOIN sessions s ON s.id = ss.session_id
           WHERE ${selection.sql} ORDER BY sre.round_id, sre.position, sre.id`,
          ...selection.params,
        ),
        db.getAllAsync<ExerciseCatalogTransfer>(
          `SELECT DISTINCT ec.* FROM exercise_catalog ec
           WHERE ec.id IN (
             SELECT se.catalog_id FROM session_exercises se
             JOIN sessions s ON s.id = se.session_id
             WHERE ${selection.sql} AND se.catalog_id IS NOT NULL
           ) OR ec.id IN (
             SELECT stm.catalog_id FROM superset_template_members stm
             JOIN superset_templates st ON st.id = stm.template_id
             WHERE st.profile_id IN (${profileSlots}) AND stm.catalog_id IS NOT NULL
           )
           ORDER BY ec.normalized_name, ec.id`,
          ...selection.params,
          ...options.profileIds,
        ),
        db.getAllAsync<MuscleGroupTransfer>(
          `SELECT DISTINCT mg.* FROM muscle_group_catalog mg
           WHERE mg.id IN (
             SELECT se.muscle_group_id FROM session_exercises se
             JOIN sessions s ON s.id = se.session_id
             WHERE ${selection.sql} AND se.muscle_group_id IS NOT NULL
           ) OR mg.id IN (
             SELECT stm.muscle_group_id FROM superset_template_members stm
             JOIN superset_templates st ON st.id = stm.template_id
             WHERE st.profile_id IN (${profileSlots}) AND stm.muscle_group_id IS NOT NULL
           ) OR mg.id IN (
             SELECT ec.muscle_group_id FROM exercise_catalog ec
             JOIN session_exercises se ON se.catalog_id = ec.id
             JOIN sessions s ON s.id = se.session_id
             WHERE ${selection.sql} AND ec.muscle_group_id IS NOT NULL
           ) OR mg.id IN (
             SELECT ec.muscle_group_id FROM exercise_catalog ec
             JOIN superset_template_members stm ON stm.catalog_id = ec.id
             JOIN superset_templates st ON st.id = stm.template_id
             WHERE st.profile_id IN (${profileSlots}) AND ec.muscle_group_id IS NOT NULL
           )
           ORDER BY mg.normalized_name, mg.id`,
          ...selection.params,
          ...options.profileIds,
          ...selection.params,
          ...options.profileIds,
        ),
      ])
    : Promise.resolve(null);

  const bmiParams: (string | number | null)[] = [...options.profileIds];
  let bmiWhere = `profile_id IN (${profileSlots})`;
  if (options.dateRange) {
    bmiWhere += ' AND local_date BETWEEN ? AND ?';
    bmiParams.push(options.dateRange.start, options.dateRange.end);
  }
  const bmiPromise = includesBmi
    ? db.getAllAsync<BmiMeasurementTransfer>(
        `SELECT * FROM bmi_measurements WHERE ${bmiWhere}
         ORDER BY profile_id, measured_at, created_at, id`,
        ...bmiParams,
      )
    : Promise.resolve([]);

  const [workout, bmiMeasurements] = await Promise.all([workoutPromise, bmiPromise]);
  if (!workout) return { ...empty, bmiMeasurements };
  const [
    sessions,
    sessionExercises,
    workoutSets,
    supersetTemplates,
    supersetTemplateMembers,
    supersets,
    supersetMembers,
    supersetRounds,
    supersetRoundEntries,
    exerciseCatalog,
    muscleGroups,
  ] = workout;
  return {
    muscleGroups,
    exerciseCatalog,
    sessions,
    sessionExercises,
    workoutSets,
    supersetTemplates,
    supersetTemplateMembers,
    supersets,
    supersetMembers,
    supersetRounds,
    supersetRoundEntries,
    bmiMeasurements,
  };
}

export function countsForData(profiles: ProfileTransfer[], data: TransferData): TransferCounts {
  return {
    profiles: profiles.length,
    sessions: data.sessions.length,
    exercises: data.sessionExercises.length,
    sets: data.workoutSets.length,
    bmiMeasurements: data.bmiMeasurements.length,
    supersets: data.supersets.length,
    templates: data.supersetTemplates.length,
  };
}
