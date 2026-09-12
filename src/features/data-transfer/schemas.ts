import { z } from 'zod';

const id = z.string().min(1).max(200);
const timestamp = z.number().int().nonnegative();
const position = z.number().int().nonnegative();
const nullableNumber = z.number().finite().nullable();
const nullableString = z.string().nullable();
const localDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }, 'Invalid calendar date.');

export const transferDatasetSchema = z.enum(['workouts', 'bmi']);
export const transferFormatSchema = z.enum(['csv-zip', 'fitness-trail-json']);
export const exerciseTypeSchema = z.enum(['free_weight', 'machine', 'body_weight', 'cardio']);
export const setKindSchema = z.enum(['strength', 'duration', 'calories']);
export const weightUnitSchema = z.enum(['kg', 'lb']);
export const heightUnitSchema = z.enum(['cm', 'ft-in']);
export const genderSchema = z.enum(['woman', 'man', 'non_binary', 'prefer_not_to_say']);

export const transferDateRangeSchema = z
  .object({
    start: localDate,
    end: localDate,
  })
  .refine(({ start, end }) => start <= end, 'The start date must not be after the end date.');

export const profileTransferSchema = z
  .object({
    id,
    name: z.string().trim().min(1).max(80),
    age_source: z.enum(['age', 'dob']),
    age_years: z.number().int().min(18).max(150).nullable(),
    date_of_birth: localDate.nullable(),
    gender: genderSchema,
    input_height_unit: heightUnitSchema,
    height_cm: z.number().finite().positive(),
    created_at: timestamp,
    updated_at: timestamp,
  })
  .superRefine((value, context) => {
    const validAge =
      (value.age_source === 'age' && value.age_years !== null && value.date_of_birth === null) ||
      (value.age_source === 'dob' && value.age_years === null && value.date_of_birth !== null);
    if (!validAge) context.addIssue({ code: 'custom', message: 'Invalid profile age fields.' });
  });

export const muscleGroupTransferSchema = z.object({
  id,
  normalized_name: z.string().min(1).max(80),
  display_name: z.string().trim().min(1).max(80),
  is_predefined: z.number().int().min(0).max(1),
  use_count: z.number().int().nonnegative(),
  last_used_at: timestamp,
  created_at: timestamp,
  updated_at: timestamp,
});

export const exerciseCatalogTransferSchema = z.object({
  id,
  normalized_name: z.string().min(1).max(80),
  display_name: z.string().trim().min(1).max(80),
  muscle_group_id: nullableString,
  exercise_type: exerciseTypeSchema,
  use_count: z.number().int().nonnegative(),
  last_used_at: timestamp,
  created_at: timestamp,
  updated_at: timestamp,
});

export const sessionTransferSchema = z.object({
  id,
  profile_id: id,
  name: z.string().trim().min(1).max(80),
  scheduled_at: timestamp,
  local_date: localDate,
  timezone_offset_minutes: z.number().int().min(-840).max(840),
  created_at: timestamp,
  updated_at: timestamp,
});

export const sessionExerciseTransferSchema = z.object({
  id,
  session_id: id,
  catalog_id: nullableString,
  display_name: z.string().trim().min(1).max(80),
  normalized_name: z.string().min(1).max(80),
  muscle_group_id: nullableString,
  exercise_type: exerciseTypeSchema,
  position,
  created_at: timestamp,
  updated_at: timestamp,
});

export const workoutSetTransferSchema = z
  .object({
    id,
    exercise_id: id,
    position,
    set_kind: setKindSchema,
    reps: z.number().int().positive().nullable(),
    input_weight: nullableNumber,
    input_unit: weightUnitSchema.nullable(),
    weight_kg: nullableNumber,
    weight_lb: nullableNumber,
    tut_seconds: z.number().int().nonnegative().nullable(),
    duration_seconds: z.number().int().positive().nullable(),
    calories: z.number().int().positive().nullable(),
    created_at: timestamp,
    updated_at: timestamp,
  })
  .superRefine((value, context) => {
    const strength =
      value.set_kind === 'strength' &&
      value.reps !== null &&
      value.input_unit !== null &&
      value.tut_seconds !== null &&
      value.duration_seconds === null &&
      value.calories === null &&
      (value.input_weight === null
        ? value.weight_kg === null && value.weight_lb === null
        : value.input_weight >= 0 &&
          value.weight_kg !== null &&
          value.weight_kg >= 0 &&
          value.weight_lb !== null &&
          value.weight_lb >= 0);
    const duration =
      value.set_kind === 'duration' &&
      value.duration_seconds !== null &&
      value.reps === null &&
      value.input_weight === null &&
      value.input_unit === null &&
      value.weight_kg === null &&
      value.weight_lb === null &&
      value.tut_seconds === null &&
      value.calories === null;
    const calories =
      value.set_kind === 'calories' &&
      value.calories !== null &&
      value.reps === null &&
      value.input_weight === null &&
      value.input_unit === null &&
      value.weight_kg === null &&
      value.weight_lb === null &&
      value.tut_seconds === null &&
      value.duration_seconds === null;
    if (!strength && !duration && !calories) {
      context.addIssue({ code: 'custom', message: 'Set values do not match the set kind.' });
    }
  });

export const supersetTemplateTransferSchema = z.object({
  id,
  profile_id: id,
  name: z.string().trim().min(1).max(80),
  created_at: timestamp,
  updated_at: timestamp,
});

export const supersetTemplateMemberTransferSchema = z.object({
  id,
  template_id: id,
  catalog_id: nullableString,
  display_name: z.string().trim().min(1).max(80),
  normalized_name: z.string().min(1).max(80),
  muscle_group_id: nullableString,
  exercise_type: exerciseTypeSchema,
  position,
});

export const supersetTransferSchema = z.object({
  id,
  session_id: id,
  template_id: nullableString,
  name: z.string().trim().min(1).max(80),
  created_at: timestamp,
  updated_at: timestamp,
});

export const supersetMemberTransferSchema = z.object({
  superset_id: id,
  exercise_id: id,
  position,
  created_at: timestamp,
});

export const supersetRoundTransferSchema = z
  .object({
    id,
    superset_id: id,
    position,
    status: z.enum(['in_progress', 'completed']),
    completed_at: timestamp.nullable(),
    created_at: timestamp,
    updated_at: timestamp,
  })
  .superRefine((value, context) => {
    const valid =
      (value.status === 'completed' && value.completed_at !== null) ||
      (value.status === 'in_progress' && value.completed_at === null);
    if (!valid) context.addIssue({ code: 'custom', message: 'Invalid superset round status.' });
  });

export const supersetRoundEntryTransferSchema = z
  .object({
    id,
    round_id: id,
    exercise_id: id,
    position,
    status: z.enum(['pending', 'completed', 'skipped']),
    workout_set_id: nullableString,
    created_at: timestamp,
    updated_at: timestamp,
  })
  .superRefine((value, context) => {
    const valid =
      (value.status === 'completed' && value.workout_set_id !== null) ||
      (value.status !== 'completed' && value.workout_set_id === null);
    if (!valid) context.addIssue({ code: 'custom', message: 'Invalid superset entry status.' });
  });

export const bmiMeasurementTransferSchema = z.object({
  id,
  profile_id: id,
  measured_at: timestamp,
  local_date: localDate,
  timezone_offset_minutes: z.number().int().min(-840).max(840),
  input_weight: z.number().finite().positive(),
  input_weight_unit: weightUnitSchema,
  weight_kg: z.number().finite().positive(),
  weight_lb: z.number().finite().positive(),
  input_height_unit: heightUnitSchema,
  height_cm: z.number().finite().positive(),
  age_years: z.number().int().min(18).max(150),
  gender: genderSchema,
  created_at: timestamp,
  updated_at: timestamp,
});

export const transferDataSchema = z.object({
  muscleGroups: z.array(muscleGroupTransferSchema),
  exerciseCatalog: z.array(exerciseCatalogTransferSchema),
  sessions: z.array(sessionTransferSchema),
  sessionExercises: z.array(sessionExerciseTransferSchema),
  workoutSets: z.array(workoutSetTransferSchema),
  supersetTemplates: z.array(supersetTemplateTransferSchema),
  supersetTemplateMembers: z.array(supersetTemplateMemberTransferSchema),
  supersets: z.array(supersetTransferSchema),
  supersetMembers: z.array(supersetMemberTransferSchema),
  supersetRounds: z.array(supersetRoundTransferSchema),
  supersetRoundEntries: z.array(supersetRoundEntryTransferSchema),
  bmiMeasurements: z.array(bmiMeasurementTransferSchema),
});

export const transferBundleSchema = z.object({
  format: z.literal('fitness-trail-backup'),
  formatVersion: z.literal(1),
  exportId: id,
  exportedAt: timestamp,
  appVersion: z.string().min(1),
  selection: z.object({
    datasets: z.array(transferDatasetSchema).min(1),
    dateRange: transferDateRangeSchema.nullable(),
  }),
  profiles: z.array(profileTransferSchema).min(1),
  data: transferDataSchema,
});

export const csvManifestSchema = z.object({
  format: z.literal('fitness-trail-csv-bundle'),
  formatVersion: z.literal(1),
  exportId: id,
  exportedAt: timestamp,
  appVersion: z.string().min(1),
  selection: z.object({
    datasets: z.array(transferDatasetSchema).min(1),
    dateRange: transferDateRangeSchema.nullable(),
  }),
  profiles: z.array(profileTransferSchema).min(1),
  files: z.array(
    z.object({
      path: z.string().regex(/^profiles\/[A-Za-z0-9_-]+\/(workouts|bmi)\.csv$/),
      dataset: transferDatasetSchema,
      profileId: id,
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
      recordCount: z.number().int().nonnegative(),
    }),
  ),
});

export type TransferBundle = z.infer<typeof transferBundleSchema>;
export type TransferData = z.infer<typeof transferDataSchema>;
export type ProfileTransfer = z.infer<typeof profileTransferSchema>;
export type SessionTransfer = z.infer<typeof sessionTransferSchema>;
export type SessionExerciseTransfer = z.infer<typeof sessionExerciseTransferSchema>;
export type WorkoutSetTransfer = z.infer<typeof workoutSetTransferSchema>;
export type BmiMeasurementTransfer = z.infer<typeof bmiMeasurementTransferSchema>;
export type CsvManifest = z.infer<typeof csvManifestSchema>;
