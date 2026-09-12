import { validateBundleRelationships } from '@/features/data-transfer/bundle';
import {
  BMI_SAMPLE_ROW,
  createBmiCsv,
  createTemplateCsv,
  createWorkoutCsv,
  parseTransferCsv,
  WORKOUT_SAMPLE_ROW,
} from '@/features/data-transfer/csv';
import { bmiRowsToData, workoutRowsToData } from '@/features/data-transfer/csv-import';
import {
  profileTransferSchema,
  type TransferBundle,
  transferBundleSchema,
} from '@/features/data-transfer/schemas';

let mockUuidCounter = 0;
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => `generated-${++mockUuidCounter}`) }));

const profile = profileTransferSchema.parse({
  id: 'profile-1',
  name: 'Alex',
  age_source: 'age',
  age_years: 30,
  date_of_birth: null,
  gender: 'prefer_not_to_say',
  input_height_unit: 'cm',
  height_cm: 175,
  created_at: 1,
  updated_at: 1,
});

function bundle(): TransferBundle {
  const scheduledAt = Date.parse('2026-09-12T07:30:00.000Z');
  return transferBundleSchema.parse({
    format: 'fitness-trail-backup',
    formatVersion: 1,
    exportId: 'export-1',
    exportedAt: scheduledAt,
    appVersion: '1.0.0',
    selection: { datasets: ['workouts', 'bmi'], dateRange: null },
    profiles: [profile],
    data: {
      muscleGroups: [
        {
          id: 'group-1',
          normalized_name: 'quadriceps',
          display_name: 'Quadriceps',
          is_predefined: 1,
          use_count: 1,
          last_used_at: scheduledAt,
          created_at: 1,
          updated_at: 1,
        },
      ],
      exerciseCatalog: [],
      sessions: [
        {
          id: 'session-1',
          profile_id: profile.id,
          name: '=SUM(1,1)',
          scheduled_at: scheduledAt,
          local_date: '2026-09-12',
          timezone_offset_minutes: -330,
          created_at: scheduledAt,
          updated_at: scheduledAt,
        },
      ],
      sessionExercises: [
        {
          id: 'exercise-1',
          session_id: 'session-1',
          catalog_id: null,
          display_name: 'Press, row\nΩ',
          normalized_name: 'press, row ω',
          muscle_group_id: 'group-1',
          exercise_type: 'free_weight',
          position: 0,
          created_at: scheduledAt,
          updated_at: scheduledAt,
        },
        {
          id: 'exercise-2',
          session_id: 'session-1',
          catalog_id: null,
          display_name: 'No sets',
          normalized_name: 'no sets',
          muscle_group_id: 'group-1',
          exercise_type: 'body_weight',
          position: 1,
          created_at: scheduledAt,
          updated_at: scheduledAt,
        },
      ],
      workoutSets: [
        {
          id: 'set-1',
          exercise_id: 'exercise-1',
          position: 0,
          set_kind: 'strength',
          reps: 5,
          input_weight: 80,
          input_unit: 'kg',
          weight_kg: 80,
          weight_lb: 176.3696,
          tut_seconds: 20,
          duration_seconds: null,
          calories: null,
          created_at: scheduledAt,
          updated_at: scheduledAt,
        },
      ],
      supersetTemplates: [],
      supersetTemplateMembers: [],
      supersets: [],
      supersetMembers: [],
      supersetRounds: [],
      supersetRoundEntries: [],
      bmiMeasurements: [
        {
          id: 'bmi-1',
          profile_id: profile.id,
          measured_at: scheduledAt,
          local_date: '2026-09-12',
          timezone_offset_minutes: -330,
          input_weight: 70,
          input_weight_unit: 'kg',
          weight_kg: 70,
          weight_lb: 154.3234,
          input_height_unit: 'cm',
          height_cm: 175,
          age_years: 30,
          gender: 'prefer_not_to_say',
          created_at: scheduledAt,
          updated_at: scheduledAt,
        },
      ],
    },
  });
}

describe('data transfer CSV contracts', () => {
  beforeEach(() => {
    mockUuidCounter = 0;
  });

  test('writes deterministic spreadsheet-safe workout CSV and restores quoted Unicode rows', () => {
    const source = bundle();
    const csv = createWorkoutCsv(source, profile.id);

    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('\r\n');
    expect(csv).toContain("'=SUM(1,1)");
    expect(createWorkoutCsv(source, profile.id)).toBe(csv);

    const parsed = parseTransferCsv(csv);
    expect(parsed.dataset).toBe('workouts');
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0].exercise_name).toBe('Press, row\nΩ');
    expect(parsed.rows[1].set_kind).toBe('');

    const converted = workoutRowsToData(parsed.rows, profile, 'workouts.csv');
    expect(converted.invalidRowCount).toBe(0);
    expect(converted.data.sessions[0].name).toBe('=SUM(1,1)');
    expect(converted.data.sessionExercises).toHaveLength(2);
    expect(converted.data.workoutSets).toHaveLength(1);
  });

  test('uses the recorded timezone offset when recreating local BMI dates', () => {
    const row = {
      ...BMI_SAMPLE_ROW,
      measured_at: '2026-09-12T00:30:00.000Z',
      timezone_offset_minutes: '300',
      measurement_id: '',
      measurement_updated_at: '',
    };
    const converted = bmiRowsToData([row], profile, 'bmi.csv');

    expect(converted.invalidRowCount).toBe(0);
    expect(converted.data.bmiMeasurements[0].local_date).toBe('2026-09-11');
    expect(converted.data.bmiMeasurements[0].weight_kg).toBe(70);
  });

  test('rejects set kinds that do not match the exercise type', () => {
    const converted = workoutRowsToData(
      [{ ...WORKOUT_SAMPLE_ROW, exercise_type: 'cardio', muscle_group: '' }],
      profile,
      'workouts.csv',
    );

    expect(converted.invalidRowCount).toBe(1);
    expect(converted.issues[0]).toMatchObject({ row: 2, column: 'set_kind' });
  });

  test('reports missing required headers and shares schemas with templates', () => {
    expect(parseTransferCsv('measured_at,weight\r\n2026-09-12,70').missingHeaders).toContain(
      'timezone_offset_minutes',
    );
    expect(parseTransferCsv(createTemplateCsv('workouts')).missingHeaders).toEqual([]);
    expect(parseTransferCsv(createTemplateCsv('bmi')).missingHeaders).toEqual([]);
    expect(createBmiCsv(bundle(), profile.id)).toContain('measurement_updated_at');
  });

  test('blocks incompatible sets and broken canonical BMI values in JSON data', () => {
    const source = bundle();
    source.data.sessionExercises[0].exercise_type = 'cardio';
    source.data.bmiMeasurements[0].weight_lb = 1;

    const issues = validateBundleRelationships(source);
    expect(issues.map(({ message }) => message).join(' ')).toContain('not compatible');
    expect(issues.map(({ message }) => message).join(' ')).toContain(
      'inconsistent canonical weight',
    );
  });
});
