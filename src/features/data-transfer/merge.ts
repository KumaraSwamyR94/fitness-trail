import type { SQLiteDatabase } from 'expo-sqlite';

import type { ParsedImportFile } from '@/features/data-transfer/file-codec';
import type { TransferBundle, TransferData } from '@/features/data-transfer/schemas';
import type {
  ImportActionCounts,
  ImportPreview,
  ImportProfilePreview,
  ImportResult,
  TransferIssue,
} from '@/features/data-transfer/types';
import { normalizeName } from '@/utils/names';

type Row = Record<string, string | number | null>;
type DataKey = keyof TransferData;

interface TableConfig {
  dataKey: DataKey | 'profiles';
  table: string;
  keyFields: string[];
  updatedAt: boolean;
  immutableExisting?: boolean;
}

const TABLES: TableConfig[] = [
  { dataKey: 'profiles', table: 'profiles', keyFields: ['id'], updatedAt: true },
  {
    dataKey: 'muscleGroups',
    table: 'muscle_group_catalog',
    keyFields: ['id'],
    updatedAt: true,
    immutableExisting: true,
  },
  {
    dataKey: 'exerciseCatalog',
    table: 'exercise_catalog',
    keyFields: ['id'],
    updatedAt: true,
    immutableExisting: true,
  },
  { dataKey: 'sessions', table: 'sessions', keyFields: ['id'], updatedAt: true },
  {
    dataKey: 'sessionExercises',
    table: 'session_exercises',
    keyFields: ['id'],
    updatedAt: true,
  },
  { dataKey: 'workoutSets', table: 'workout_sets', keyFields: ['id'], updatedAt: true },
  {
    dataKey: 'supersetTemplates',
    table: 'superset_templates',
    keyFields: ['id'],
    updatedAt: true,
  },
  {
    dataKey: 'supersetTemplateMembers',
    table: 'superset_template_members',
    keyFields: ['id'],
    updatedAt: false,
  },
  { dataKey: 'supersets', table: 'supersets', keyFields: ['id'], updatedAt: true },
  {
    dataKey: 'supersetMembers',
    table: 'superset_members',
    keyFields: ['superset_id', 'exercise_id'],
    updatedAt: false,
  },
  {
    dataKey: 'supersetRounds',
    table: 'superset_rounds',
    keyFields: ['id'],
    updatedAt: true,
  },
  {
    dataKey: 'supersetRoundEntries',
    table: 'superset_round_entries',
    keyFields: ['id'],
    updatedAt: true,
  },
  {
    dataKey: 'bmiMeasurements',
    table: 'bmi_measurements',
    keyFields: ['id'],
    updatedAt: true,
  },
];

type LocalState = Record<TableConfig['dataKey'], Row[]>;

function cloneBundle(bundle: TransferBundle): TransferBundle {
  return JSON.parse(JSON.stringify(bundle)) as TransferBundle;
}

function rowKey(config: TableConfig, row: Row): string {
  return config.keyFields.map((field) => String(row[field])).join('|');
}

function recordKey(config: TableConfig, row: Row): string {
  return `${String(config.dataKey)}:${rowKey(config, row)}`;
}

function idRecordKey(dataKey: TableConfig['dataKey'], id: unknown): string {
  return `${String(dataKey)}:${String(id)}`;
}

function hasConflictedDependency(
  config: TableConfig,
  row: Row,
  conflicts: ReadonlySet<string>,
): boolean {
  if (config.dataKey === 'sessionExercises') {
    return conflicts.has(idRecordKey('sessions', row.session_id));
  }
  if (config.dataKey === 'workoutSets') {
    return conflicts.has(idRecordKey('sessionExercises', row.exercise_id));
  }
  if (config.dataKey === 'supersetTemplateMembers') {
    return conflicts.has(idRecordKey('supersetTemplates', row.template_id));
  }
  if (config.dataKey === 'supersets') {
    return (
      conflicts.has(idRecordKey('sessions', row.session_id)) ||
      (row.template_id !== null && conflicts.has(idRecordKey('supersetTemplates', row.template_id)))
    );
  }
  if (config.dataKey === 'supersetMembers') {
    return (
      conflicts.has(idRecordKey('supersets', row.superset_id)) ||
      conflicts.has(idRecordKey('sessionExercises', row.exercise_id))
    );
  }
  if (config.dataKey === 'supersetRounds') {
    return conflicts.has(idRecordKey('supersets', row.superset_id));
  }
  if (config.dataKey === 'supersetRoundEntries') {
    return (
      conflicts.has(idRecordKey('supersetRounds', row.round_id)) ||
      conflicts.has(idRecordKey('sessionExercises', row.exercise_id)) ||
      (row.workout_set_id !== null && conflicts.has(idRecordKey('workoutSets', row.workout_set_id)))
    );
  }
  return false;
}

function rowsFor(bundle: TransferBundle, key: TableConfig['dataKey']): Row[] {
  return (key === 'profiles' ? bundle.profiles : bundle.data[key]) as Row[];
}

async function loadLocalState(db: SQLiteDatabase): Promise<LocalState> {
  const rows = await Promise.all(
    TABLES.map((config) => db.getAllAsync<Row>(`SELECT * FROM ${config.table}`)),
  );
  return Object.fromEntries(
    TABLES.map((config, index) => [config.dataKey, rows[index]]),
  ) as LocalState;
}

function mapByKey(config: TableConfig, rows: Row[]): Map<string, Row> {
  return new Map(rows.map((row) => [rowKey(config, row), row]));
}

function replaceReferences(
  bundle: TransferBundle,
  kind: string,
  oldId: string,
  nextId: string,
): void {
  if (oldId === nextId) return;
  if (kind === 'muscleGroups') {
    for (const row of bundle.data.exerciseCatalog)
      if (row.muscle_group_id === oldId) row.muscle_group_id = nextId;
    for (const row of bundle.data.sessionExercises)
      if (row.muscle_group_id === oldId) row.muscle_group_id = nextId;
    for (const row of bundle.data.supersetTemplateMembers)
      if (row.muscle_group_id === oldId) row.muscle_group_id = nextId;
  } else if (kind === 'exerciseCatalog') {
    for (const row of bundle.data.sessionExercises)
      if (row.catalog_id === oldId) row.catalog_id = nextId;
    for (const row of bundle.data.supersetTemplateMembers)
      if (row.catalog_id === oldId) row.catalog_id = nextId;
  } else if (kind === 'sessions') {
    for (const row of bundle.data.sessionExercises)
      if (row.session_id === oldId) row.session_id = nextId;
    for (const row of bundle.data.supersets) if (row.session_id === oldId) row.session_id = nextId;
  } else if (kind === 'sessionExercises') {
    for (const row of bundle.data.workoutSets)
      if (row.exercise_id === oldId) row.exercise_id = nextId;
    for (const row of bundle.data.supersetMembers)
      if (row.exercise_id === oldId) row.exercise_id = nextId;
    for (const row of bundle.data.supersetRoundEntries)
      if (row.exercise_id === oldId) row.exercise_id = nextId;
  } else if (kind === 'workoutSets') {
    for (const row of bundle.data.supersetRoundEntries)
      if (row.workout_set_id === oldId) row.workout_set_id = nextId;
  } else if (kind === 'supersetTemplates') {
    for (const row of bundle.data.supersetTemplateMembers)
      if (row.template_id === oldId) row.template_id = nextId;
    for (const row of bundle.data.supersets)
      if (row.template_id === oldId) row.template_id = nextId;
  } else if (kind === 'supersets') {
    for (const row of bundle.data.supersetMembers)
      if (row.superset_id === oldId) row.superset_id = nextId;
    for (const row of bundle.data.supersetRounds)
      if (row.superset_id === oldId) row.superset_id = nextId;
  } else if (kind === 'supersetRounds') {
    for (const row of bundle.data.supersetRoundEntries)
      if (row.round_id === oldId) row.round_id = nextId;
  }
}

function dedupeById<T extends { id: string }>(rows: T[]): T[] {
  return [...new Map(rows.map((row) => [row.id, row])).values()];
}

function naturalMarker(kind: string, id: string): string {
  return `${kind}:${id}`;
}

async function normalizeNaturalMatches(
  db: SQLiteDatabase,
  source: ParsedImportFile,
): Promise<{ bundle: TransferBundle; natural: Set<string> }> {
  const bundle = cloneBundle(source.bundle);
  const generated = new Set(source.generatedIds);
  const natural = new Set<string>();
  const local = await loadLocalState(db);

  const normalizeNamed = (
    kind: 'muscleGroups' | 'exerciseCatalog',
    normalizedField: 'normalized_name',
  ) => {
    const localByName = new Map(
      (local[kind] as Row[]).map((row) => [String(row[normalizedField]), row]),
    );
    const incomingRows = bundle.data[kind] as { id: string; normalized_name: string }[];
    for (const row of incomingRows) {
      const match = localByName.get(row[normalizedField]);
      if (match && match.id !== row.id) {
        const oldId = row.id;
        row.id = String(match.id);
        replaceReferences(bundle, kind, oldId, row.id);
        natural.add(naturalMarker(kind, row.id));
      }
    }
    const deduped = dedupeById(incomingRows);
    if (kind === 'muscleGroups') bundle.data.muscleGroups = deduped as TransferData['muscleGroups'];
    else bundle.data.exerciseCatalog = deduped as TransferData['exerciseCatalog'];
  };
  normalizeNamed('muscleGroups', 'normalized_name');
  normalizeNamed('exerciseCatalog', 'normalized_name');

  const localSessions = local.sessions;
  for (const row of bundle.data.sessions) {
    if (!generated.has(row.id)) continue;
    const match = localSessions.find(
      (candidate) =>
        candidate.profile_id === row.profile_id &&
        candidate.scheduled_at === row.scheduled_at &&
        normalizeName(String(candidate.name)) === normalizeName(row.name),
    );
    if (match) {
      const oldId = row.id;
      row.id = String(match.id);
      replaceReferences(bundle, 'sessions', oldId, row.id);
      natural.add(naturalMarker('sessions', row.id));
    }
  }
  bundle.data.sessions = dedupeById(bundle.data.sessions);

  for (const row of bundle.data.sessionExercises) {
    if (!generated.has(row.id)) continue;
    const match = local.sessionExercises.find(
      (candidate) =>
        candidate.session_id === row.session_id &&
        candidate.normalized_name === row.normalized_name,
    );
    if (match && match.id !== row.id) {
      const oldId = row.id;
      row.id = String(match.id);
      replaceReferences(bundle, 'sessionExercises', oldId, row.id);
      natural.add(naturalMarker('sessionExercises', row.id));
    }
  }
  if (source.format !== 'json') {
    const localById = new Map(local.sessionExercises.map((row) => [String(row.id), row]));
    for (const row of bundle.data.sessionExercises) {
      const existing = localById.get(row.id);
      if (existing)
        row.catalog_id = existing.catalog_id === null ? null : String(existing.catalog_id);
    }
  }
  bundle.data.sessionExercises = dedupeById(bundle.data.sessionExercises);

  for (const row of bundle.data.workoutSets) {
    if (!generated.has(row.id)) continue;
    const match = local.workoutSets.find(
      (candidate) =>
        candidate.exercise_id === row.exercise_id && candidate.position === row.position,
    );
    if (match && match.id !== row.id) {
      const oldId = row.id;
      row.id = String(match.id);
      replaceReferences(bundle, 'workoutSets', oldId, row.id);
      natural.add(naturalMarker('workoutSets', row.id));
    }
  }
  bundle.data.workoutSets = dedupeById(bundle.data.workoutSets);

  for (const row of bundle.data.supersetTemplateMembers) {
    if (!generated.has(row.id)) continue;
    const match = local.supersetTemplateMembers.find(
      (candidate) =>
        candidate.template_id === row.template_id &&
        candidate.normalized_name === row.normalized_name,
    );
    if (match && match.id !== row.id) {
      row.id = String(match.id);
      natural.add(naturalMarker('supersetTemplateMembers', row.id));
    }
  }
  bundle.data.supersetTemplateMembers = dedupeById(bundle.data.supersetTemplateMembers);

  for (const row of bundle.data.supersets) {
    if (!generated.has(row.id)) continue;
    const match = local.supersets.find(
      (candidate) =>
        candidate.session_id === row.session_id &&
        normalizeName(String(candidate.name)) === normalizeName(row.name),
    );
    if (match) {
      const oldId = row.id;
      row.id = String(match.id);
      replaceReferences(bundle, 'supersets', oldId, row.id);
      natural.add(naturalMarker('supersets', row.id));
    }
  }
  if (source.format !== 'json') {
    const localById = new Map(local.supersets.map((row) => [String(row.id), row]));
    for (const row of bundle.data.supersets) {
      const existing = localById.get(row.id);
      if (!existing) continue;
      row.template_id = existing.template_id === null ? null : String(existing.template_id);
      row.updated_at = Number(existing.updated_at);
    }
  }
  bundle.data.supersets = dedupeById(bundle.data.supersets);

  for (const row of bundle.data.supersetRounds) {
    if (!generated.has(row.id)) continue;
    const match = local.supersetRounds.find(
      (candidate) =>
        candidate.superset_id === row.superset_id && candidate.position === row.position,
    );
    if (match && match.id !== row.id) {
      const oldId = row.id;
      row.id = String(match.id);
      replaceReferences(bundle, 'supersetRounds', oldId, row.id);
      natural.add(naturalMarker('supersetRounds', row.id));
    }
  }
  bundle.data.supersetRounds = dedupeById(bundle.data.supersetRounds);

  for (const row of bundle.data.supersetRoundEntries) {
    if (!generated.has(row.id)) continue;
    const match = local.supersetRoundEntries.find(
      (candidate) =>
        candidate.round_id === row.round_id && candidate.exercise_id === row.exercise_id,
    );
    if (match && match.id !== row.id) {
      row.id = String(match.id);
      natural.add(naturalMarker('supersetRoundEntries', row.id));
    }
  }
  bundle.data.supersetRoundEntries = dedupeById(bundle.data.supersetRoundEntries);

  for (const row of bundle.data.bmiMeasurements) {
    if (!generated.has(row.id)) continue;
    const match = local.bmiMeasurements.find(
      (candidate) =>
        candidate.profile_id === row.profile_id && candidate.measured_at === row.measured_at,
    );
    if (match) {
      row.id = String(match.id);
      natural.add(naturalMarker('bmiMeasurements', row.id));
    }
  }
  bundle.data.bmiMeasurements = dedupeById(bundle.data.bmiMeasurements);
  return { bundle, natural };
}

function comparableEntries(row: Row, ignoreTimestamps: boolean): [string, unknown][] {
  return Object.entries(row).filter(
    ([key]) => !ignoreTimestamps || (key !== 'created_at' && key !== 'updated_at'),
  );
}

function rowsEqual(incoming: Row, local: Row, ignoreTimestamps = false): boolean {
  return comparableEntries(incoming, ignoreTimestamps).every(
    ([key, value]) => local[key] === value,
  );
}

function uniqueCollision(config: TableConfig, incoming: Row, localRows: Row[]): Row | null {
  const differentKey = (candidate: Row) => rowKey(config, candidate) !== rowKey(config, incoming);
  if (config.dataKey === 'sessionExercises') {
    return (
      localRows.find(
        (candidate) =>
          differentKey(candidate) &&
          candidate.session_id === incoming.session_id &&
          (candidate.normalized_name === incoming.normalized_name ||
            candidate.position === incoming.position),
      ) ?? null
    );
  }
  if (config.dataKey === 'workoutSets') {
    return (
      localRows.find(
        (candidate) =>
          differentKey(candidate) &&
          candidate.exercise_id === incoming.exercise_id &&
          candidate.position === incoming.position,
      ) ?? null
    );
  }
  if (config.dataKey === 'supersetTemplateMembers') {
    return (
      localRows.find(
        (candidate) =>
          differentKey(candidate) &&
          candidate.template_id === incoming.template_id &&
          (candidate.normalized_name === incoming.normalized_name ||
            candidate.position === incoming.position),
      ) ?? null
    );
  }
  if (config.dataKey === 'supersetMembers') {
    return (
      localRows.find(
        (candidate) =>
          differentKey(candidate) &&
          (candidate.exercise_id === incoming.exercise_id ||
            (candidate.superset_id === incoming.superset_id &&
              candidate.position === incoming.position)),
      ) ?? null
    );
  }
  if (config.dataKey === 'supersetRounds') {
    return (
      localRows.find(
        (candidate) =>
          differentKey(candidate) &&
          candidate.superset_id === incoming.superset_id &&
          candidate.position === incoming.position,
      ) ?? null
    );
  }
  if (config.dataKey === 'supersetRoundEntries') {
    return (
      localRows.find(
        (candidate) =>
          differentKey(candidate) &&
          ((candidate.round_id === incoming.round_id &&
            (candidate.exercise_id === incoming.exercise_id ||
              candidate.position === incoming.position)) ||
            (incoming.workout_set_id !== null &&
              candidate.workout_set_id === incoming.workout_set_id)),
      ) ?? null
    );
  }
  return null;
}

function emptyActions(invalid = 0): ImportActionCounts {
  return { additions: 0, updates: 0, unchanged: 0, conflicts: 0, invalid };
}

function datasetFor(config: TableConfig): 'workouts' | 'bmi' | null {
  if (config.dataKey === 'profiles') return null;
  return config.dataKey === 'bmiMeasurements' ? 'bmi' : 'workouts';
}

function classifyRow(
  config: TableConfig,
  row: Row,
  localRows: Row[],
  natural: Set<string>,
): 'addition' | 'update' | 'unchanged' | 'conflict' {
  const existing = mapByKey(config, localRows).get(rowKey(config, row));
  if (!existing) return uniqueCollision(config, row, localRows) ? 'conflict' : 'addition';
  if (uniqueCollision(config, row, localRows)) return 'conflict';
  if (config.immutableExisting) return 'unchanged';
  const isNatural = natural.has(naturalMarker(String(config.dataKey), String(row.id)));
  if (isNatural) return rowsEqual(row, existing, true) ? 'unchanged' : 'conflict';
  if (rowsEqual(row, existing)) return 'unchanged';
  if (config.updatedAt && Number(row.updated_at) > Number(existing.updated_at)) return 'update';
  return config.updatedAt ? 'unchanged' : 'conflict';
}

function profilePreviews(bundle: TransferBundle, localProfiles: Row[]): ImportProfilePreview[] {
  const local = new Map(localProfiles.map((profile) => [String(profile.id), profile]));
  return bundle.profiles.map((profile) => {
    const existing = local.get(profile.id);
    const action = !existing
      ? 'create'
      : profile.updated_at > Number(existing.updated_at)
        ? 'update'
        : 'unchanged';
    return { id: profile.id, name: profile.name, action };
  });
}

function dateCoverage(bundle: TransferBundle): ImportPreview['dateCoverage'] {
  const dates = [
    ...bundle.data.sessions.map(({ local_date }) => local_date),
    ...bundle.data.bmiMeasurements.map(({ local_date }) => local_date),
  ].sort();
  return dates.length ? { start: dates[0], end: dates[dates.length - 1] } : null;
}

export async function createImportPreview(
  db: SQLiteDatabase,
  source: ParsedImportFile,
  fileName: string,
): Promise<ImportPreview> {
  const { bundle, natural } = await normalizeNaturalMatches(db, source);
  const local = await loadLocalState(db);
  const counts = emptyActions(source.invalidRowCount);
  const datasetCounts = {
    workouts: emptyActions(source.invalidByDataset.workouts),
    bmi: emptyActions(source.invalidByDataset.bmi),
  };
  const issues: TransferIssue[] = [...source.issues];
  const conflictRecordKeys = new Set<string>();

  for (const config of TABLES) {
    for (const row of rowsFor(bundle, config.dataKey)) {
      const dependencyConflict = hasConflictedDependency(config, row, conflictRecordKeys);
      const classification = dependencyConflict
        ? 'conflict'
        : classifyRow(config, row, local[config.dataKey], natural);
      const scopedCounts = datasetFor(config) ? datasetCounts[datasetFor(config)!] : null;
      if (classification === 'addition') counts.additions += 1;
      else if (classification === 'update') counts.updates += 1;
      else if (classification === 'unchanged') counts.unchanged += 1;
      else {
        counts.conflicts += 1;
        const key = recordKey(config, row);
        conflictRecordKeys.add(key);
        if (issues.length < 50) {
          issues.push({
            severity: 'warning',
            message: dependencyConflict
              ? `${String(config.dataKey)} record ${rowKey(config, row)} depends on another skipped conflict and will also be skipped.`
              : `${String(config.dataKey)} record ${rowKey(config, row)} conflicts with newer or differently keyed local data and will be skipped.`,
          });
        }
      }
      if (scopedCounts) {
        if (classification === 'addition') scopedCounts.additions += 1;
        else if (classification === 'update') scopedCounts.updates += 1;
        else if (classification === 'unchanged') scopedCounts.unchanged += 1;
        else scopedCounts.conflicts += 1;
      }
    }
  }
  const hasBlockingError = issues.some(({ severity }) => severity === 'error');
  return {
    id: bundle.exportId,
    fileName,
    format: source.format,
    datasets: bundle.selection.datasets,
    dateRange: bundle.selection.dateRange,
    dateCoverage: dateCoverage(bundle),
    profiles: profilePreviews(bundle, local.profiles),
    counts,
    datasetCounts,
    issues,
    canImport: !hasBlockingError && counts.additions + counts.updates > 0,
    requiresWarningConfirmation: counts.conflicts + counts.invalid > 0,
    bundle,
    naturalRecordIds: [...natural],
    conflictRecordKeys: [...conflictRecordKeys],
  };
}

async function insertRow(db: SQLiteDatabase, config: TableConfig, row: Row): Promise<void> {
  if (config.dataKey === 'profiles') {
    await db.runAsync(
      `INSERT INTO profiles
       (id, name, age_source, age_years, date_of_birth, gender, input_height_unit, height_cm,
        photo_kind, photo_ref, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'none', NULL, ?, ?)`,
      row.id,
      row.name,
      row.age_source,
      row.age_years,
      row.date_of_birth,
      row.gender,
      row.input_height_unit,
      row.height_cm,
      row.created_at,
      row.updated_at,
    );
    return;
  }
  const columns = Object.keys(row);
  await db.runAsync(
    `INSERT INTO ${config.table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    ...columns.map((column) => row[column]),
  );
}

async function updateRow(db: SQLiteDatabase, config: TableConfig, row: Row): Promise<void> {
  const columns = Object.keys(row).filter(
    (column) => !config.keyFields.includes(column) && column !== 'created_at',
  );
  const where = config.keyFields.map((column) => `${column} = ?`).join(' AND ');
  await db.runAsync(
    `UPDATE ${config.table} SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE ${where}`,
    ...columns.map((column) => row[column]),
    ...config.keyFields.map((column) => row[column]),
  );
}

export async function applyImportPreview(
  db: SQLiteDatabase,
  preview: ImportPreview,
): Promise<ImportResult> {
  if (!preview.canImport) throw new Error('This file has no changes that can be imported.');
  const result: ImportResult = { ...emptyActions(preview.counts.invalid), failed: 0 };
  const natural = new Set(preview.naturalRecordIds);
  const previewConflicts = new Set(preview.conflictRecordKeys);

  await db.withExclusiveTransactionAsync(async (transaction) => {
    const selected = await transaction.getFirstAsync<{ selected_profile_id: string | null }>(
      'SELECT selected_profile_id FROM profile_state WHERE singleton = 1',
    );
    const local = await loadLocalState(transaction);
    for (const config of TABLES) {
      const localRows = local[config.dataKey];
      for (const row of rowsFor(preview.bundle, config.dataKey)) {
        const key = recordKey(config, row);
        if (previewConflicts.has(key) || hasConflictedDependency(config, row, previewConflicts)) {
          previewConflicts.add(key);
          result.conflicts += 1;
          continue;
        }
        const classification = classifyRow(config, row, localRows, natural);
        if (classification === 'conflict') {
          previewConflicts.add(key);
          result.conflicts += 1;
          continue;
        }
        if (classification === 'unchanged') {
          result.unchanged += 1;
          continue;
        }
        if (classification === 'addition') {
          await insertRow(transaction, config, row);
          localRows.push(row);
          result.additions += 1;
        } else {
          await updateRow(transaction, config, row);
          const existingIndex = localRows.findIndex(
            (candidate) => rowKey(config, candidate) === rowKey(config, row),
          );
          if (existingIndex >= 0)
            localRows[existingIndex] = { ...localRows[existingIndex], ...row };
          result.updates += 1;
        }
      }
    }
    if (!selected?.selected_profile_id && preview.bundle.profiles[0]) {
      await transaction.runAsync(
        'UPDATE profile_state SET selected_profile_id = ? WHERE singleton = 1',
        preview.bundle.profiles[0].id,
      );
    }
  });
  return result;
}
