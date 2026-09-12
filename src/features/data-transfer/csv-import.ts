import { randomUUID } from 'expo-crypto';

import { unescapeSpreadsheetText } from '@/features/data-transfer/csv';
import {
  bmiMeasurementTransferSchema,
  type ProfileTransfer,
  sessionExerciseTransferSchema,
  sessionTransferSchema,
  supersetMemberTransferSchema,
  supersetTransferSchema,
  type TransferData,
  workoutSetTransferSchema,
} from '@/features/data-transfer/schemas';
import type { TransferIssue } from '@/features/data-transfer/types';
import { cleanDisplayName, normalizeName } from '@/utils/names';
import { convertWeight } from '@/utils/weight';

interface CsvConversion {
  data: TransferData;
  generatedIds: string[];
  issues: TransferIssue[];
  validRowCount: number;
  invalidRowCount: number;
}

function emptyData(): TransferData {
  return {
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
}

function text(row: Record<string, string>, key: string): string {
  return unescapeSpreadsheetText((row[key] ?? '').trim());
}

function finite(value: string): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function integer(value: string): number | null {
  const parsed = finite(value);
  return parsed !== null && Number.isInteger(parsed) ? parsed : null;
}

function dateValue(value: string): number | null {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.exec(
      value,
    );
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const validDay =
    month >= 1 && month <= 12 && day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (!validDay || Number(hourText) > 23 || Number(minuteText) > 59 || Number(secondText) > 59) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function localDateAt(timestamp: number, timezoneOffsetMinutes: number): string {
  const localInstant = new Date(timestamp - timezoneOffsetMinutes * 60_000);
  return [
    localInstant.getUTCFullYear(),
    String(localInstant.getUTCMonth() + 1).padStart(2, '0'),
    String(localInstant.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function issueForRow(
  issues: TransferIssue[],
  file: string,
  row: number,
  message: string,
  column?: string,
): void {
  issues.push({ severity: 'warning', file, row, column, message });
}

function zodMessage(result: { success: false; error: { issues: { message: string }[] } }): string {
  return result.error.issues[0]?.message ?? 'Invalid row.';
}

export function workoutRowsToData(
  rows: Record<string, string>[],
  profile: ProfileTransfer,
  file: string,
): CsvConversion {
  const data = emptyData();
  const issues: TransferIssue[] = [];
  const generatedIds = new Set<string>();
  const sessions = new Map<string, TransferData['sessions'][number]>();
  const exercises = new Map<string, TransferData['sessionExercises'][number]>();
  const sets = new Map<string, TransferData['workoutSets'][number]>();
  const muscleGroups = new Map<string, TransferData['muscleGroups'][number]>();
  const supersetGroups = new Map<
    string,
    { group: TransferData['supersets'][number]; members: Map<string, number> }
  >();
  let validRowCount = 0;
  let invalidRowCount = 0;

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const scheduledAt = dateValue(text(row, 'session_started_at'));
    const timezoneOffset = integer(text(row, 'session_timezone_offset_minutes'));
    const sessionNameRaw = text(row, 'session_name');
    const exerciseNameRaw = text(row, 'exercise_name');
    const exerciseType = text(row, 'exercise_type');
    const exerciseOrder = integer(text(row, 'exercise_order'));
    if (
      scheduledAt === null ||
      timezoneOffset === null ||
      timezoneOffset < -840 ||
      timezoneOffset > 840 ||
      !sessionNameRaw ||
      !exerciseNameRaw ||
      exerciseOrder === null ||
      exerciseOrder < 1
    ) {
      invalidRowCount += 1;
      issueForRow(
        issues,
        file,
        rowNumber,
        'Session time, timezone, names, and a positive exercise order are required.',
      );
      return;
    }

    let sessionName: string;
    let exerciseName: string;
    try {
      sessionName = cleanDisplayName(sessionNameRaw);
      exerciseName = cleanDisplayName(exerciseNameRaw);
    } catch (error) {
      invalidRowCount += 1;
      issueForRow(
        issues,
        file,
        rowNumber,
        error instanceof Error ? error.message : 'Invalid name.',
      );
      return;
    }

    const suppliedSessionId = text(row, 'session_id');
    const sessionKey = suppliedSessionId || `${scheduledAt}|${normalizeName(sessionName)}`;
    let session = sessions.get(sessionKey);
    if (!session) {
      const sessionId = suppliedSessionId || randomUUID();
      if (!suppliedSessionId) generatedIds.add(sessionId);
      const updatedAt = dateValue(text(row, 'session_updated_at')) ?? scheduledAt;
      const candidate = {
        id: sessionId,
        profile_id: profile.id,
        name: sessionName,
        scheduled_at: scheduledAt,
        local_date: localDateAt(scheduledAt, timezoneOffset),
        timezone_offset_minutes: timezoneOffset,
        created_at: Math.min(scheduledAt, updatedAt),
        updated_at: updatedAt,
      };
      const parsed = sessionTransferSchema.safeParse(candidate);
      if (!parsed.success) {
        invalidRowCount += 1;
        issueForRow(issues, file, rowNumber, zodMessage(parsed));
        return;
      }
      session = parsed.data;
      sessions.set(sessionKey, session);
    } else if (
      session.scheduled_at !== scheduledAt ||
      session.name !== sessionName ||
      session.timezone_offset_minutes !== timezoneOffset
    ) {
      invalidRowCount += 1;
      issueForRow(
        issues,
        file,
        rowNumber,
        'Rows sharing a session ID contain different session values.',
      );
      return;
    }

    const muscleGroupName = text(row, 'muscle_group');
    if (exerciseType !== 'cardio' && !muscleGroupName) {
      invalidRowCount += 1;
      issueForRow(
        issues,
        file,
        rowNumber,
        'A muscle group is required for non-cardio exercises.',
        'muscle_group',
      );
      return;
    }
    let muscleGroupId: string | null = null;
    if (muscleGroupName) {
      const normalized = normalizeName(muscleGroupName);
      let group = muscleGroups.get(normalized);
      if (!group) {
        const now = Date.now();
        group = {
          id: randomUUID(),
          normalized_name: normalized,
          display_name: cleanDisplayName(muscleGroupName),
          is_predefined: 0,
          use_count: 1,
          last_used_at: scheduledAt,
          created_at: now,
          updated_at: now,
        };
        generatedIds.add(group.id);
        muscleGroups.set(normalized, group);
      } else {
        group.use_count += 1;
        group.last_used_at = Math.max(group.last_used_at, scheduledAt);
      }
      muscleGroupId = group.id;
    }

    const suppliedExerciseId = text(row, 'exercise_id');
    const exerciseKey = `${session.id}|${suppliedExerciseId || normalizeName(exerciseName)}`;
    let exercise = exercises.get(exerciseKey);
    if (!exercise) {
      const exerciseId = suppliedExerciseId || randomUUID();
      if (!suppliedExerciseId) generatedIds.add(exerciseId);
      const updatedAt = dateValue(text(row, 'exercise_updated_at')) ?? session.updated_at;
      const candidate = {
        id: exerciseId,
        session_id: session.id,
        catalog_id: null,
        display_name: exerciseName,
        normalized_name: normalizeName(exerciseName),
        muscle_group_id: muscleGroupId,
        exercise_type: exerciseType,
        position: exerciseOrder - 1,
        created_at: Math.min(session.created_at, updatedAt),
        updated_at: updatedAt,
      };
      const parsed = sessionExerciseTransferSchema.safeParse(candidate);
      if (!parsed.success) {
        invalidRowCount += 1;
        issueForRow(issues, file, rowNumber, zodMessage(parsed));
        return;
      }
      exercise = parsed.data;
      exercises.set(exerciseKey, exercise);
    } else if (
      exercise.display_name !== exerciseName ||
      exercise.exercise_type !== exerciseType ||
      exercise.position !== exerciseOrder - 1
    ) {
      invalidRowCount += 1;
      issueForRow(
        issues,
        file,
        rowNumber,
        'Rows sharing an exercise ID contain different exercise values.',
      );
      return;
    }

    const supersetName = text(row, 'superset_name');
    if (supersetName) {
      const suppliedSupersetId = text(row, 'superset_id');
      const supersetOrder = integer(text(row, 'superset_order'));
      if (supersetOrder === null || supersetOrder < 1) {
        invalidRowCount += 1;
        issueForRow(
          issues,
          file,
          rowNumber,
          'Superset order must be a positive whole number.',
          'superset_order',
        );
        return;
      }
      const key = `${session.id}|${suppliedSupersetId || normalizeName(supersetName)}`;
      let group = supersetGroups.get(key);
      if (!group) {
        const supersetId = suppliedSupersetId || randomUUID();
        if (!suppliedSupersetId) generatedIds.add(supersetId);
        const parsed = supersetTransferSchema.safeParse({
          id: supersetId,
          session_id: session.id,
          template_id: null,
          name: cleanDisplayName(supersetName),
          created_at: session.created_at,
          updated_at: session.updated_at,
        });
        if (!parsed.success) {
          invalidRowCount += 1;
          issueForRow(issues, file, rowNumber, zodMessage(parsed));
          return;
        }
        group = { group: parsed.data, members: new Map() };
        supersetGroups.set(key, group);
      }
      const priorPosition = group.members.get(exercise.id);
      if (priorPosition !== undefined && priorPosition !== supersetOrder - 1) {
        invalidRowCount += 1;
        issueForRow(issues, file, rowNumber, 'An exercise has conflicting superset positions.');
        return;
      }
      group.members.set(exercise.id, supersetOrder - 1);
    }

    const setKind = text(row, 'set_kind');
    if (setKind) {
      const setNumber = integer(text(row, 'set_number'));
      if (setNumber === null || setNumber < 1) {
        invalidRowCount += 1;
        issueForRow(
          issues,
          file,
          rowNumber,
          'Set number must be a positive whole number.',
          'set_number',
        );
        return;
      }
      const suppliedSetId = text(row, 'set_id');
      const setKey = `${exercise.id}|${suppliedSetId || setNumber}`;
      if (sets.has(setKey)) {
        invalidRowCount += 1;
        issueForRow(issues, file, rowNumber, 'The set ID or set number is duplicated.');
        return;
      }
      const setId = suppliedSetId || randomUUID();
      if (!suppliedSetId) generatedIds.add(setId);
      const inputWeight = finite(text(row, 'weight'));
      const inputUnit = text(row, 'weight_unit') || null;
      const compatibleKind =
        exercise.exercise_type === 'cardio'
          ? setKind === 'duration' || setKind === 'calories'
          : setKind === 'strength';
      if (!compatibleKind) {
        invalidRowCount += 1;
        issueForRow(
          issues,
          file,
          rowNumber,
          exercise.exercise_type === 'cardio'
            ? 'Cardio exercises require duration or calories sets.'
            : 'Non-cardio exercises require strength sets.',
          'set_kind',
        );
        return;
      }
      if (
        setKind === 'strength' &&
        exercise.exercise_type !== 'body_weight' &&
        inputWeight === null
      ) {
        invalidRowCount += 1;
        issueForRow(
          issues,
          file,
          rowNumber,
          'Weight is required for free-weight and machine exercises.',
          'weight',
        );
        return;
      }
      const converted =
        inputWeight !== null && (inputUnit === 'kg' || inputUnit === 'lb')
          ? convertWeight(inputWeight, inputUnit)
          : { weightKg: null, weightLb: null };
      const updatedAt = dateValue(text(row, 'set_updated_at')) ?? exercise.updated_at;
      const candidate = {
        id: setId,
        exercise_id: exercise.id,
        position: setNumber - 1,
        set_kind: setKind,
        reps: integer(text(row, 'reps')),
        input_weight: inputWeight,
        input_unit: inputUnit,
        weight_kg: converted.weightKg,
        weight_lb: converted.weightLb,
        tut_seconds: integer(text(row, 'tut_seconds')),
        duration_seconds: integer(text(row, 'duration_seconds')),
        calories: integer(text(row, 'calories')),
        created_at: Math.min(exercise.created_at, updatedAt),
        updated_at: updatedAt,
      };
      const parsed = workoutSetTransferSchema.safeParse(candidate);
      if (!parsed.success) {
        invalidRowCount += 1;
        issueForRow(issues, file, rowNumber, zodMessage(parsed));
        return;
      }
      sets.set(setKey, parsed.data);
    }
    validRowCount += 1;
  });

  for (const { group, members } of supersetGroups.values()) {
    if (members.size < 2) {
      issues.push({
        severity: 'warning',
        file,
        message: `Superset “${group.name}” was skipped because it has fewer than two exercises.`,
      });
      continue;
    }
    const usedPositions = new Set(members.values());
    if (usedPositions.size !== members.size) {
      issues.push({
        severity: 'warning',
        file,
        message: `Superset “${group.name}” has duplicate positions and was skipped.`,
      });
      continue;
    }
    data.supersets.push(group);
    for (const [exerciseId, memberPosition] of members) {
      const parsed = supersetMemberTransferSchema.safeParse({
        superset_id: group.id,
        exercise_id: exerciseId,
        position: memberPosition,
        created_at: group.created_at,
      });
      if (parsed.success) data.supersetMembers.push(parsed.data);
    }
  }
  data.sessions = [...sessions.values()];
  data.sessionExercises = [...exercises.values()];
  data.workoutSets = [...sets.values()];
  data.muscleGroups = [...muscleGroups.values()];
  return { data, generatedIds: [...generatedIds], issues, validRowCount, invalidRowCount };
}

export function bmiRowsToData(
  rows: Record<string, string>[],
  profile: ProfileTransfer,
  file: string,
): CsvConversion {
  const data = emptyData();
  const issues: TransferIssue[] = [];
  const generatedIds = new Set<string>();
  const measurements = new Map<string, TransferData['bmiMeasurements'][number]>();
  let validRowCount = 0;
  let invalidRowCount = 0;

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const measuredAt = dateValue(text(row, 'measured_at'));
    const timezoneOffset = integer(text(row, 'timezone_offset_minutes'));
    const inputWeight = finite(text(row, 'weight'));
    const inputWeightUnit = text(row, 'weight_unit');
    const heightCm = finite(text(row, 'height_cm'));
    const ageYears = integer(text(row, 'age_years'));
    const gender = text(row, 'gender');
    if (
      measuredAt === null ||
      timezoneOffset === null ||
      inputWeight === null ||
      heightCm === null ||
      ageYears === null ||
      (inputWeightUnit !== 'kg' && inputWeightUnit !== 'lb')
    ) {
      invalidRowCount += 1;
      issueForRow(
        issues,
        file,
        rowNumber,
        'Measurement time, timezone, weight, unit, height, age, and gender are required.',
      );
      return;
    }
    const suppliedId = text(row, 'measurement_id');
    const key = suppliedId || String(measuredAt);
    if (measurements.has(key)) {
      invalidRowCount += 1;
      issueForRow(issues, file, rowNumber, 'The measurement ID or timestamp is duplicated.');
      return;
    }
    const measurementId = suppliedId || randomUUID();
    if (!suppliedId) generatedIds.add(measurementId);
    const converted = convertWeight(inputWeight, inputWeightUnit);
    const updatedAt = dateValue(text(row, 'measurement_updated_at')) ?? measuredAt;
    const candidate = {
      id: measurementId,
      profile_id: profile.id,
      measured_at: measuredAt,
      local_date: localDateAt(measuredAt, timezoneOffset),
      timezone_offset_minutes: timezoneOffset,
      input_weight: inputWeight,
      input_weight_unit: inputWeightUnit,
      weight_kg: converted.weightKg,
      weight_lb: converted.weightLb,
      input_height_unit: 'cm',
      height_cm: heightCm,
      age_years: ageYears,
      gender,
      created_at: Math.min(measuredAt, updatedAt),
      updated_at: updatedAt,
    };
    const parsed = bmiMeasurementTransferSchema.safeParse(candidate);
    if (!parsed.success) {
      invalidRowCount += 1;
      issueForRow(issues, file, rowNumber, zodMessage(parsed));
      return;
    }
    measurements.set(key, parsed.data);
    validRowCount += 1;
  });
  data.bmiMeasurements = [...measurements.values()];
  return { data, generatedIds: [...generatedIds], issues, validRowCount, invalidRowCount };
}

export function mergeTransferData(target: TransferData, source: TransferData): void {
  const targetGroups = new Map(target.muscleGroups.map((group) => [group.normalized_name, group]));
  const sourceGroups = source.muscleGroups.filter((group) => {
    const existing = targetGroups.get(group.normalized_name);
    if (!existing) {
      targetGroups.set(group.normalized_name, group);
      return true;
    }
    for (const exercise of source.sessionExercises) {
      if (exercise.muscle_group_id === group.id) exercise.muscle_group_id = existing.id;
    }
    for (const catalog of source.exerciseCatalog) {
      if (catalog.muscle_group_id === group.id) catalog.muscle_group_id = existing.id;
    }
    for (const member of source.supersetTemplateMembers) {
      if (member.muscle_group_id === group.id) member.muscle_group_id = existing.id;
    }
    return false;
  });
  target.muscleGroups.push(...sourceGroups);
  for (const key of Object.keys(target) as (keyof TransferData)[]) {
    if (key === 'muscleGroups') continue;
    (target[key] as unknown[]).push(...(source[key] as unknown[]));
  }
}

export { emptyData };
