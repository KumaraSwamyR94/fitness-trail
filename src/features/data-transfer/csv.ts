import Papa from 'papaparse';

import type { TransferBundle } from '@/features/data-transfer/schemas';

export interface CsvColumnDefinition {
  key: string;
  label: string;
  required: boolean;
  description: string;
}

export const WORKOUT_CSV_COLUMNS: CsvColumnDefinition[] = [
  {
    key: 'session_started_at',
    label: 'Session time',
    required: true,
    description: 'ISO 8601 date and time, for example 2026-09-12T07:30:00.000Z.',
  },
  {
    key: 'session_timezone_offset_minutes',
    label: 'Timezone offset',
    required: true,
    description: 'Device timezone offset in minutes when the session was logged.',
  },
  {
    key: 'session_name',
    label: 'Session name',
    required: true,
    description: '1 to 80 characters.',
  },
  {
    key: 'exercise_name',
    label: 'Exercise name',
    required: true,
    description: '1 to 80 characters.',
  },
  {
    key: 'exercise_type',
    label: 'Exercise type',
    required: true,
    description: 'free_weight, machine, body_weight, or cardio.',
  },
  {
    key: 'muscle_group',
    label: 'Muscle group',
    required: false,
    description: 'Required for non-cardio exercises.',
  },
  {
    key: 'exercise_order',
    label: 'Exercise order',
    required: true,
    description: 'One-based position within the session.',
  },
  {
    key: 'superset_id',
    label: 'Superset ID',
    required: false,
    description: 'Stable ID from an app export.',
  },
  {
    key: 'superset_name',
    label: 'Superset name',
    required: false,
    description: 'Optional superset group name.',
  },
  {
    key: 'superset_order',
    label: 'Superset order',
    required: false,
    description: 'One-based exercise position within the superset.',
  },
  {
    key: 'set_number',
    label: 'Set number',
    required: false,
    description: 'One-based set position.',
  },
  {
    key: 'set_kind',
    label: 'Set kind',
    required: false,
    description: 'strength, duration, or calories. Leave blank for an exercise without sets.',
  },
  {
    key: 'reps',
    label: 'Reps',
    required: false,
    description: 'Positive whole number for strength sets.',
  },
  {
    key: 'weight',
    label: 'Weight',
    required: false,
    description: 'Optional added weight for strength sets.',
  },
  {
    key: 'weight_unit',
    label: 'Weight unit',
    required: false,
    description: 'kg or lb for strength sets.',
  },
  {
    key: 'tut_seconds',
    label: 'TUT seconds',
    required: false,
    description: 'Non-negative whole seconds.',
  },
  {
    key: 'duration_seconds',
    label: 'Duration seconds',
    required: false,
    description: 'Positive whole seconds for duration sets.',
  },
  {
    key: 'calories',
    label: 'Calories',
    required: false,
    description: 'Positive whole number for calorie sets.',
  },
  { key: 'session_id', label: 'Session ID', required: false, description: 'Stable sync metadata.' },
  {
    key: 'session_updated_at',
    label: 'Session updated',
    required: false,
    description: 'ISO 8601 sync metadata.',
  },
  {
    key: 'exercise_id',
    label: 'Exercise ID',
    required: false,
    description: 'Stable sync metadata.',
  },
  {
    key: 'exercise_updated_at',
    label: 'Exercise updated',
    required: false,
    description: 'ISO 8601 sync metadata.',
  },
  { key: 'set_id', label: 'Set ID', required: false, description: 'Stable sync metadata.' },
  {
    key: 'set_updated_at',
    label: 'Set updated',
    required: false,
    description: 'ISO 8601 sync metadata.',
  },
];

export const BMI_CSV_COLUMNS: CsvColumnDefinition[] = [
  {
    key: 'measured_at',
    label: 'Measurement time',
    required: true,
    description: 'ISO 8601 date and time.',
  },
  {
    key: 'timezone_offset_minutes',
    label: 'Timezone offset',
    required: true,
    description: 'Device timezone offset in minutes when measured.',
  },
  { key: 'weight', label: 'Weight', required: true, description: 'Positive number.' },
  { key: 'weight_unit', label: 'Weight unit', required: true, description: 'kg or lb.' },
  {
    key: 'height_cm',
    label: 'Height cm',
    required: true,
    description: 'Positive height in centimetres.',
  },
  { key: 'age_years', label: 'Age', required: true, description: 'Whole number from 18 to 150.' },
  {
    key: 'gender',
    label: 'Gender',
    required: true,
    description: 'woman, man, non_binary, or prefer_not_to_say.',
  },
  {
    key: 'bmi',
    label: 'BMI',
    required: false,
    description: 'For reference only. Recalculated on import.',
  },
  {
    key: 'measurement_id',
    label: 'Measurement ID',
    required: false,
    description: 'Stable sync metadata.',
  },
  {
    key: 'measurement_updated_at',
    label: 'Measurement updated',
    required: false,
    description: 'ISO 8601 sync metadata.',
  },
];

export const WORKOUT_SAMPLE_ROW: Record<string, string> = {
  session_started_at: '2026-09-12T07:30:00.000Z',
  session_timezone_offset_minutes: '-330',
  session_name: 'Morning Strength',
  exercise_name: 'Back Squat',
  exercise_type: 'free_weight',
  muscle_group: 'Quadriceps',
  exercise_order: '1',
  superset_id: '',
  superset_name: '',
  superset_order: '',
  set_number: '1',
  set_kind: 'strength',
  reps: '5',
  weight: '80',
  weight_unit: 'kg',
  tut_seconds: '20',
  duration_seconds: '',
  calories: '',
  session_id: '',
  session_updated_at: '',
  exercise_id: '',
  exercise_updated_at: '',
  set_id: '',
  set_updated_at: '',
};

export const BMI_SAMPLE_ROW: Record<string, string> = {
  measured_at: '2026-09-12T07:00:00.000Z',
  timezone_offset_minutes: '-330',
  weight: '70',
  weight_unit: 'kg',
  height_cm: '175',
  age_years: '30',
  gender: 'prefer_not_to_say',
  bmi: '22.86',
  measurement_id: '',
  measurement_updated_at: '',
};

export type WorkoutCsvRow = Record<(typeof WORKOUT_CSV_COLUMNS)[number]['key'], string>;
export type BmiCsvRow = Record<(typeof BMI_CSV_COLUMNS)[number]['key'], string>;

function iso(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

function cell(value: string | number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

function serialize(rows: Record<string, string>[], columns: CsvColumnDefinition[]): string {
  return (
    '\uFEFF' +
    Papa.unparse(rows, {
      columns: columns.map(({ key }) => key),
      header: true,
      newline: '\r\n',
      escapeFormulae: true,
    })
  );
}

export function createWorkoutCsv(bundle: TransferBundle, profileId: string): string {
  const sessions = bundle.data.sessions
    .filter((session) => session.profile_id === profileId)
    .sort(
      (left, right) => left.scheduled_at - right.scheduled_at || left.id.localeCompare(right.id),
    );
  const exercisesBySession = new Map<string, typeof bundle.data.sessionExercises>();
  for (const exercise of bundle.data.sessionExercises) {
    const values = exercisesBySession.get(exercise.session_id) ?? [];
    values.push(exercise);
    exercisesBySession.set(exercise.session_id, values);
  }
  const setsByExercise = new Map<string, typeof bundle.data.workoutSets>();
  for (const set of bundle.data.workoutSets) {
    const values = setsByExercise.get(set.exercise_id) ?? [];
    values.push(set);
    setsByExercise.set(set.exercise_id, values);
  }
  const groups = new Map(bundle.data.supersets.map((superset) => [superset.id, superset]));
  const memberships = new Map(
    bundle.data.supersetMembers.map((member) => [
      member.exercise_id,
      { ...member, group: groups.get(member.superset_id) },
    ]),
  );
  const muscleGroups = new Map(
    bundle.data.muscleGroups.map((group) => [group.id, group.display_name]),
  );
  const rows: Record<string, string>[] = [];

  for (const session of sessions) {
    const exercises = (exercisesBySession.get(session.id) ?? []).sort(
      (left, right) => left.position - right.position || left.id.localeCompare(right.id),
    );
    for (const exercise of exercises) {
      const sets = (setsByExercise.get(exercise.id) ?? []).sort(
        (left, right) => left.position - right.position || left.id.localeCompare(right.id),
      );
      const membership = memberships.get(exercise.id);
      for (const set of sets.length ? sets : [null]) {
        rows.push({
          session_started_at: iso(session.scheduled_at),
          session_timezone_offset_minutes: cell(session.timezone_offset_minutes),
          session_name: session.name,
          exercise_name: exercise.display_name,
          exercise_type: exercise.exercise_type,
          muscle_group: exercise.muscle_group_id
            ? (muscleGroups.get(exercise.muscle_group_id) ?? '')
            : '',
          exercise_order: cell(exercise.position + 1),
          superset_id: membership?.group?.id ?? '',
          superset_name: membership?.group?.name ?? '',
          superset_order: membership ? cell(membership.position + 1) : '',
          set_number: set ? cell(set.position + 1) : '',
          set_kind: set?.set_kind ?? '',
          reps: cell(set?.reps),
          weight: cell(set?.input_weight),
          weight_unit: set?.input_unit ?? '',
          tut_seconds: cell(set?.tut_seconds),
          duration_seconds: cell(set?.duration_seconds),
          calories: cell(set?.calories),
          session_id: session.id,
          session_updated_at: iso(session.updated_at),
          exercise_id: exercise.id,
          exercise_updated_at: iso(exercise.updated_at),
          set_id: set?.id ?? '',
          set_updated_at: set ? iso(set.updated_at) : '',
        });
      }
    }
  }
  return serialize(rows, WORKOUT_CSV_COLUMNS);
}

export function createBmiCsv(bundle: TransferBundle, profileId: string): string {
  const rows = bundle.data.bmiMeasurements
    .filter((measurement) => measurement.profile_id === profileId)
    .sort(
      (left, right) => left.measured_at - right.measured_at || left.created_at - right.created_at,
    )
    .map((measurement) => ({
      measured_at: iso(measurement.measured_at),
      timezone_offset_minutes: cell(measurement.timezone_offset_minutes),
      weight: cell(measurement.input_weight),
      weight_unit: measurement.input_weight_unit,
      height_cm: cell(measurement.height_cm),
      age_years: cell(measurement.age_years),
      gender: measurement.gender,
      bmi: cell(measurement.weight_kg / (measurement.height_cm / 100) ** 2),
      measurement_id: measurement.id,
      measurement_updated_at: iso(measurement.updated_at),
    }));
  return serialize(rows, BMI_CSV_COLUMNS);
}

export function createTemplateCsv(dataset: 'workouts' | 'bmi', includeSample = false): string {
  return dataset === 'workouts'
    ? serialize(includeSample ? [WORKOUT_SAMPLE_ROW] : [], WORKOUT_CSV_COLUMNS)
    : serialize(includeSample ? [BMI_SAMPLE_ROW] : [], BMI_CSV_COLUMNS);
}

export interface ParsedCsv {
  dataset: 'workouts' | 'bmi' | null;
  rows: Record<string, string>[];
  errors: { message: string; row?: number }[];
  missingHeaders: string[];
}

function normalizedHeader(header: string): string {
  return header
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase();
}

export function parseTransferCsv(text: string): ParsedCsv {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: normalizedHeader,
  });
  const headers = parsed.meta.fields ?? [];
  const dataset = headers.includes('session_started_at')
    ? 'workouts'
    : headers.includes('measured_at')
      ? 'bmi'
      : null;
  const definitions =
    dataset === 'workouts' ? WORKOUT_CSV_COLUMNS : dataset === 'bmi' ? BMI_CSV_COLUMNS : [];
  const missingHeaders = definitions
    .filter(({ required }) => required)
    .map(({ key }) => key)
    .filter((key) => !headers.includes(key));
  return {
    dataset,
    rows: parsed.data,
    errors: parsed.errors.map((error) => ({
      message: error.message,
      row: error.row === undefined ? undefined : error.row + 2,
    })),
    missingHeaders,
  };
}

export function unescapeSpreadsheetText(value: string): string {
  return /^'[=+\-@\t\r]/.test(value) ? value.slice(1) : value;
}
