import Constants from 'expo-constants';
import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { loadProfilesForExport, loadTransferData } from '@/features/data-transfer/repository';
import { type TransferBundle, transferBundleSchema } from '@/features/data-transfer/schemas';
import type { ExportOptions, TransferIssue } from '@/features/data-transfer/types';
import { convertWeight } from '@/utils/weight';

function localDateAt(timestamp: number, timezoneOffsetMinutes: number): string {
  const localInstant = new Date(timestamp - timezoneOffsetMinutes * 60_000);
  return [
    localInstant.getUTCFullYear(),
    String(localInstant.getUTCMonth() + 1).padStart(2, '0'),
    String(localInstant.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function approximatelyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= Math.max(0.000_001, Math.abs(right) * 0.000_001);
}

export async function createTransferBundle(
  db: SQLiteDatabase,
  options: ExportOptions,
): Promise<TransferBundle> {
  if (!options.profileIds.length) throw new Error('Choose at least one profile.');
  if (!options.datasets.length) throw new Error('Choose Workouts, BMI, or both.');
  if (options.dateRange && options.dateRange.start > options.dateRange.end) {
    throw new Error('The start date must not be after the end date.');
  }
  const profiles = await loadProfilesForExport(db, [...new Set(options.profileIds)]);
  if (profiles.length !== new Set(options.profileIds).size) {
    throw new Error('One or more selected profiles no longer exist.');
  }
  const data = await loadTransferData(db, { ...options, profileIds: profiles.map(({ id }) => id) });
  const bundle = transferBundleSchema.parse({
    format: 'fitness-trail-backup',
    formatVersion: 1,
    exportId: randomUUID(),
    exportedAt: Date.now(),
    appVersion: Constants.expoConfig?.version ?? '1.0.0',
    selection: { datasets: options.datasets, dateRange: options.dateRange },
    profiles,
    data,
  });
  const issues = validateBundleRelationships(bundle);
  if (issues.length) {
    throw new Error(`Stored data could not be exported safely. ${issues[0].message}`);
  }
  return bundle;
}

export function validateBundleRelationships(bundle: TransferBundle): TransferIssue[] {
  const issues: TransferIssue[] = [];
  const profileIds = new Set(bundle.profiles.map(({ id }) => id));
  const groupIds = new Set(bundle.data.muscleGroups.map(({ id }) => id));
  const catalogIds = new Set(bundle.data.exerciseCatalog.map(({ id }) => id));
  const sessionIds = new Set(bundle.data.sessions.map(({ id }) => id));
  const exerciseIds = new Set(bundle.data.sessionExercises.map(({ id }) => id));
  const setIds = new Set(bundle.data.workoutSets.map(({ id }) => id));
  const templateIds = new Set(bundle.data.supersetTemplates.map(({ id }) => id));
  const supersetIds = new Set(bundle.data.supersets.map(({ id }) => id));
  const roundIds = new Set(bundle.data.supersetRounds.map(({ id }) => id));
  const exercises = new Map(bundle.data.sessionExercises.map((row) => [row.id, row]));
  const sets = new Map(bundle.data.workoutSets.map((row) => [row.id, row]));
  const supersets = new Map(bundle.data.supersets.map((row) => [row.id, row]));
  const rounds = new Map(bundle.data.supersetRounds.map((row) => [row.id, row]));
  const supersetMemberKeys = new Set(
    bundle.data.supersetMembers.map((row) => `${row.superset_id}|${row.exercise_id}`),
  );

  const error = (message: string) => issues.push({ severity: 'error', message });
  const duplicateIds = (label: string, rows: { id: string }[]) => {
    const seen = new Set<string>();
    for (const { id } of rows) {
      if (seen.has(id)) error(`${label} contains duplicate ID ${id}.`);
      seen.add(id);
    }
  };
  duplicateIds('Profiles', bundle.profiles);
  duplicateIds('Muscle groups', bundle.data.muscleGroups);
  duplicateIds('Exercise catalog', bundle.data.exerciseCatalog);
  duplicateIds('Sessions', bundle.data.sessions);
  duplicateIds('Exercises', bundle.data.sessionExercises);
  duplicateIds('Sets', bundle.data.workoutSets);
  duplicateIds('Templates', bundle.data.supersetTemplates);
  duplicateIds('Template members', bundle.data.supersetTemplateMembers);
  duplicateIds('Supersets', bundle.data.supersets);
  duplicateIds('Rounds', bundle.data.supersetRounds);
  duplicateIds('Round entries', bundle.data.supersetRoundEntries);
  duplicateIds('BMI measurements', bundle.data.bmiMeasurements);
  const memberKeys = new Set<string>();
  for (const member of bundle.data.supersetMembers) {
    const key = `${member.superset_id}|${member.exercise_id}`;
    if (memberKeys.has(key)) error(`Superset members contain duplicate key ${key}.`);
    memberKeys.add(key);
  }

  if (!bundle.selection.datasets.includes('workouts')) {
    const workoutCount =
      bundle.data.sessions.length +
      bundle.data.sessionExercises.length +
      bundle.data.workoutSets.length +
      bundle.data.supersetTemplates.length +
      bundle.data.supersetTemplateMembers.length +
      bundle.data.supersets.length +
      bundle.data.supersetMembers.length +
      bundle.data.supersetRounds.length +
      bundle.data.supersetRoundEntries.length;
    if (workoutCount)
      error('The backup contains workout data that is not declared in its selection.');
  }
  if (!bundle.selection.datasets.includes('bmi') && bundle.data.bmiMeasurements.length) {
    error('The backup contains BMI data that is not declared in its selection.');
  }
  for (const catalog of bundle.data.exerciseCatalog) {
    if (catalog.muscle_group_id && !groupIds.has(catalog.muscle_group_id)) {
      error(`Catalog entry ${catalog.id} references a missing muscle group.`);
    }
  }
  for (const session of bundle.data.sessions) {
    if (!profileIds.has(session.profile_id))
      error(`Session ${session.id} references a missing profile.`);
    if (session.local_date !== localDateAt(session.scheduled_at, session.timezone_offset_minutes)) {
      error(`Session ${session.id} has an inconsistent local date.`);
    }
  }
  for (const exercise of bundle.data.sessionExercises) {
    if (!sessionIds.has(exercise.session_id))
      error(`Exercise ${exercise.id} references a missing session.`);
    if (exercise.catalog_id && !catalogIds.has(exercise.catalog_id)) {
      error(`Exercise ${exercise.id} references a missing catalog entry.`);
    }
    if (exercise.muscle_group_id && !groupIds.has(exercise.muscle_group_id)) {
      error(`Exercise ${exercise.id} references a missing muscle group.`);
    }
  }
  for (const set of bundle.data.workoutSets) {
    if (!exerciseIds.has(set.exercise_id)) error(`Set ${set.id} references a missing exercise.`);
    const exercise = exercises.get(set.exercise_id);
    if (
      exercise &&
      ((exercise.exercise_type === 'cardio' && set.set_kind === 'strength') ||
        (exercise.exercise_type !== 'cardio' && set.set_kind !== 'strength'))
    ) {
      error(`Set ${set.id} is not compatible with its exercise type.`);
    }
    if (
      exercise &&
      exercise.exercise_type !== 'body_weight' &&
      set.set_kind === 'strength' &&
      set.input_weight === null
    ) {
      error(`Set ${set.id} is missing required weight data.`);
    }
  }
  for (const template of bundle.data.supersetTemplates) {
    if (!profileIds.has(template.profile_id))
      error(`Template ${template.id} references a missing profile.`);
  }
  for (const member of bundle.data.supersetTemplateMembers) {
    if (!templateIds.has(member.template_id))
      error(`Template member ${member.id} references a missing template.`);
    if (member.catalog_id && !catalogIds.has(member.catalog_id)) {
      error(`Template member ${member.id} references a missing catalog entry.`);
    }
    if (member.muscle_group_id && !groupIds.has(member.muscle_group_id)) {
      error(`Template member ${member.id} references a missing muscle group.`);
    }
  }
  for (const superset of bundle.data.supersets) {
    if (!sessionIds.has(superset.session_id))
      error(`Superset ${superset.id} references a missing session.`);
    if (superset.template_id && !templateIds.has(superset.template_id)) {
      error(`Superset ${superset.id} references a missing template.`);
    }
  }
  for (const member of bundle.data.supersetMembers) {
    if (!supersetIds.has(member.superset_id) || !exerciseIds.has(member.exercise_id)) {
      error(`A member of superset ${member.superset_id} has a missing dependency.`);
    } else if (
      supersets.get(member.superset_id)?.session_id !==
      exercises.get(member.exercise_id)?.session_id
    ) {
      error(`A member of superset ${member.superset_id} belongs to a different session.`);
    }
  }
  for (const round of bundle.data.supersetRounds) {
    if (!supersetIds.has(round.superset_id))
      error(`Round ${round.id} references a missing superset.`);
  }
  for (const entry of bundle.data.supersetRoundEntries) {
    if (!roundIds.has(entry.round_id) || !exerciseIds.has(entry.exercise_id)) {
      error(`Round entry ${entry.id} has a missing dependency.`);
    }
    if (entry.workout_set_id && !setIds.has(entry.workout_set_id)) {
      error(`Round entry ${entry.id} references a missing set.`);
    }
    const round = rounds.get(entry.round_id);
    if (round && !supersetMemberKeys.has(`${round.superset_id}|${entry.exercise_id}`)) {
      error(`Round entry ${entry.id} references an exercise outside its superset.`);
    }
    if (entry.workout_set_id && sets.get(entry.workout_set_id)?.exercise_id !== entry.exercise_id) {
      error(`Round entry ${entry.id} references a set from another exercise.`);
    }
  }
  for (const measurement of bundle.data.bmiMeasurements) {
    if (!profileIds.has(measurement.profile_id)) {
      error(`BMI measurement ${measurement.id} references a missing profile.`);
    }
    if (
      measurement.local_date !==
      localDateAt(measurement.measured_at, measurement.timezone_offset_minutes)
    ) {
      error(`BMI measurement ${measurement.id} has an inconsistent local date.`);
    }
    const converted = convertWeight(measurement.input_weight, measurement.input_weight_unit);
    if (
      !approximatelyEqual(measurement.weight_kg, converted.weightKg) ||
      !approximatelyEqual(measurement.weight_lb, converted.weightLb)
    ) {
      error(`BMI measurement ${measurement.id} has inconsistent canonical weight values.`);
    }
  }
  return issues;
}
