import { CryptoDigestAlgorithm, digest, digestStringAsync } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

import { createTransferBundle, validateBundleRelationships } from '@/features/data-transfer/bundle';
import {
  createBmiCsv,
  createTemplateCsv,
  createWorkoutCsv,
  parseTransferCsv,
} from '@/features/data-transfer/csv';
import {
  bmiRowsToData,
  emptyData,
  mergeTransferData,
  workoutRowsToData,
} from '@/features/data-transfer/csv-import';
import { countsForData, loadProfilesForExport } from '@/features/data-transfer/repository';
import {
  type CsvManifest,
  csvManifestSchema,
  type ProfileTransfer,
  type TransferBundle,
  transferBundleSchema,
} from '@/features/data-transfer/schemas';
import type {
  ExportArtifact,
  ExportOptions,
  ImportSourceFile,
  TransferIssue,
} from '@/features/data-transfer/types';

export const MAX_TRANSFER_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_TRANSFER_RECORDS = 100_000;
const TRANSFER_DIRECTORY_NAME = 'fitness-trail-transfer';

export interface ParsedImportFile {
  bundle: TransferBundle;
  format: 'json' | 'csv' | 'csv-zip';
  generatedIds: string[];
  issues: TransferIssue[];
  invalidRowCount: number;
  invalidByDataset: Record<'workouts' | 'bmi', number>;
}

export class TransferFileError extends Error {
  constructor(
    message: string,
    readonly issues: TransferIssue[] = [{ severity: 'error', message }],
  ) {
    super(message);
    this.name = 'TransferFileError';
  }
}

function transferDirectory(): Directory {
  const directory = new Directory(Paths.cache, TRANSFER_DIRECTORY_NAME);
  directory.create({ idempotent: true, intermediates: true });
  return directory;
}

function filenameTimestamp(date = new Date()): string {
  const parts = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
    '-',
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
    String(date.getSeconds()).padStart(2, '0'),
  ];
  return parts.join('');
}

async function sha256Text(value: string): Promise<string> {
  return digestStringAsync(CryptoDigestAlgorithm.SHA256, value);
}

async function sha256Bytes(value: Uint8Array): Promise<string> {
  const input = new Uint8Array(value.byteLength);
  input.set(value);
  const buffer = await digest(CryptoDigestAlgorithm.SHA256, input);
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function writeFile(filename: string, content: string | Uint8Array): File {
  const file = new File(transferDirectory(), filename);
  file.create({ overwrite: true, intermediates: true });
  file.write(content);
  return file;
}

export async function createExportArtifact(
  db: SQLiteDatabase,
  options: ExportOptions,
): Promise<ExportArtifact> {
  const bundle = await createTransferBundle(db, options);
  const counts = countsForData(bundle.profiles, bundle.data);
  const stamp = filenameTimestamp(new Date(bundle.exportedAt));

  if (options.format === 'fitness-trail-json') {
    const content = JSON.stringify(bundle, null, 2);
    const filename = `fitness-trail-export-${stamp}.json`;
    const file = writeFile(filename, content);
    return {
      uri: file.uri,
      filename,
      mimeType: 'application/json',
      size: strToU8(content).length,
      checksum: await sha256Text(content),
      counts,
    };
  }

  if (bundle.profiles.length === 1 && options.datasets.length === 1) {
    const dataset = options.datasets[0];
    const content =
      dataset === 'workouts'
        ? createWorkoutCsv(bundle, bundle.profiles[0].id)
        : createBmiCsv(bundle, bundle.profiles[0].id);
    const filename = `fitness-trail-${dataset}-${stamp}.csv`;
    const file = writeFile(filename, content);
    return {
      uri: file.uri,
      filename,
      mimeType: 'text/csv',
      size: strToU8(content).length,
      checksum: await sha256Text(content),
      counts,
    };
  }

  const zippedFiles: Record<string, Uint8Array> = {};
  const manifestFiles: CsvManifest['files'] = [];
  for (const [index, profile] of bundle.profiles.entries()) {
    const folder = `profiles/profile-${index + 1}`;
    if (options.datasets.includes('workouts')) {
      const csv = createWorkoutCsv(bundle, profile.id);
      const path = `${folder}/workouts.csv`;
      zippedFiles[path] = strToU8(csv);
      manifestFiles.push({
        path,
        dataset: 'workouts',
        profileId: profile.id,
        sha256: await sha256Bytes(zippedFiles[path]),
        recordCount: parseTransferCsv(csv).rows.length,
      });
    }
    if (options.datasets.includes('bmi')) {
      const csv = createBmiCsv(bundle, profile.id);
      const path = `${folder}/bmi.csv`;
      zippedFiles[path] = strToU8(csv);
      manifestFiles.push({
        path,
        dataset: 'bmi',
        profileId: profile.id,
        sha256: await sha256Bytes(zippedFiles[path]),
        recordCount: bundle.data.bmiMeasurements.filter(
          ({ profile_id }) => profile_id === profile.id,
        ).length,
      });
    }
  }
  const manifest: CsvManifest = {
    format: 'fitness-trail-csv-bundle',
    formatVersion: 1,
    exportId: bundle.exportId,
    exportedAt: bundle.exportedAt,
    appVersion: bundle.appVersion,
    selection: bundle.selection,
    profiles: bundle.profiles,
    files: manifestFiles,
  };
  zippedFiles['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
  const bytes = zipSync(zippedFiles, { level: 6 });
  const filename = `fitness-trail-export-${stamp}.zip`;
  const file = writeFile(filename, bytes);
  return {
    uri: file.uri,
    filename,
    mimeType: 'application/zip',
    size: bytes.length,
    checksum: await sha256Bytes(bytes),
    counts,
  };
}

export async function createTemplateArtifact(dataset: 'workouts' | 'bmi'): Promise<ExportArtifact> {
  const content = createTemplateCsv(dataset);
  const filename = `fitness-trail-${dataset}-template.csv`;
  const file = writeFile(filename, content);
  return {
    uri: file.uri,
    filename,
    mimeType: 'text/csv',
    size: strToU8(content).length,
    checksum: await sha256Text(content),
    counts: {
      profiles: 0,
      sessions: 0,
      exercises: 0,
      sets: 0,
      bmiMeasurements: 0,
      supersets: 0,
      templates: 0,
    },
  };
}

function assertFileSize(source: ImportSourceFile): void {
  if (source.size && source.size > MAX_TRANSFER_FILE_BYTES) {
    throw new TransferFileError('The selected file is larger than the 25 MB import limit.');
  }
}

function formatZodIssues(error: {
  issues: { path: PropertyKey[]; message: string }[];
}): TransferIssue[] {
  return error.issues.slice(0, 50).map((issue) => ({
    severity: 'error',
    message: `${issue.path.join('.') || 'file'}: ${issue.message}`,
  }));
}

function assertRecordLimit(bundle: TransferBundle): void {
  const count =
    bundle.profiles.length +
    Object.values(bundle.data).reduce((total, rows) => total + rows.length, 0);
  if (count > MAX_TRANSFER_RECORDS) {
    throw new TransferFileError('The file contains more than 100,000 records.');
  }
}

function parseJsonBundle(text: string): ParsedImportFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new TransferFileError('The JSON file could not be read.');
  }
  const parsed = transferBundleSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = formatZodIssues(parsed.error);
    throw new TransferFileError(
      'The JSON backup is invalid or uses an unsupported version.',
      issues,
    );
  }
  const relationshipIssues = validateBundleRelationships(parsed.data);
  if (relationshipIssues.length) {
    throw new TransferFileError(
      'The JSON backup contains broken relationships.',
      relationshipIssues,
    );
  }
  assertRecordLimit(parsed.data);
  return {
    bundle: parsed.data,
    format: 'json',
    generatedIds: [],
    issues: [],
    invalidRowCount: 0,
    invalidByDataset: { workouts: 0, bmi: 0 },
  };
}

function bundleFromCsvParts(
  profiles: ProfileTransfer[],
  parts: {
    name: string;
    profile: ProfileTransfer;
    dataset: 'workouts' | 'bmi';
    rows: Record<string, string>[];
    parserIssues: TransferIssue[];
  }[],
  metadata: {
    exportId: string;
    exportedAt: number;
    appVersion: string;
    dateRange: CsvManifest['selection']['dateRange'];
  },
): ParsedImportFile {
  if (parts.reduce((total, part) => total + part.rows.length, 0) > MAX_TRANSFER_RECORDS) {
    throw new TransferFileError('The file contains more than 100,000 records.');
  }
  const data = emptyData();
  const generatedIds: string[] = [];
  const issues: TransferIssue[] = [];
  let invalidRowCount = 0;
  const invalidByDataset = { workouts: 0, bmi: 0 };
  for (const part of parts) {
    issues.push(...part.parserIssues);
    const converted =
      part.dataset === 'workouts'
        ? workoutRowsToData(part.rows, part.profile, part.name)
        : bmiRowsToData(part.rows, part.profile, part.name);
    mergeTransferData(data, converted.data);
    generatedIds.push(...converted.generatedIds);
    issues.push(...converted.issues);
    invalidRowCount += converted.invalidRowCount;
    invalidByDataset[part.dataset] += converted.invalidRowCount;
  }
  const parsed = transferBundleSchema.safeParse({
    format: 'fitness-trail-backup',
    formatVersion: 1,
    exportId: metadata.exportId,
    exportedAt: metadata.exportedAt,
    appVersion: metadata.appVersion,
    selection: {
      datasets: [...new Set(parts.map(({ dataset }) => dataset))],
      dateRange: metadata.dateRange,
    },
    profiles,
    data,
  });
  if (!parsed.success) {
    throw new TransferFileError(
      'The valid CSV rows could not form an import.',
      formatZodIssues(parsed.error),
    );
  }
  const relationshipIssues = validateBundleRelationships(parsed.data);
  if (relationshipIssues.length) {
    throw new TransferFileError(
      'The CSV files contain conflicting IDs or broken relationships.',
      relationshipIssues,
    );
  }
  assertRecordLimit(parsed.data);
  return {
    bundle: parsed.data,
    format: parts.length > 1 ? 'csv-zip' : 'csv',
    generatedIds,
    issues,
    invalidRowCount,
    invalidByDataset,
  };
}

async function parseZipBundle(bytes: Uint8Array): Promise<ParsedImportFile> {
  let expandedBytes = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (entry) => {
        const safePath =
          entry.name === 'manifest.json' ||
          /^profiles\/[A-Za-z0-9_-]+\/(workouts|bmi)\.csv$/.test(entry.name);
        if (!safePath || entry.name.includes('..') || entry.name.includes('\\')) {
          throw new Error(`Unsafe or unexpected archive path: ${entry.name}`);
        }
        expandedBytes += entry.originalSize;
        if (expandedBytes > MAX_TRANSFER_FILE_BYTES)
          throw new Error('Expanded archive is too large.');
        return true;
      },
    });
  } catch (error) {
    throw new TransferFileError(
      error instanceof Error
        ? `The ZIP archive is invalid: ${error.message}`
        : 'The ZIP archive is invalid.',
    );
  }
  const manifestBytes = files['manifest.json'];
  if (!manifestBytes)
    throw new TransferFileError('The ZIP archive does not contain manifest.json.');
  let manifestRaw: unknown;
  try {
    manifestRaw = JSON.parse(strFromU8(manifestBytes));
  } catch {
    throw new TransferFileError('The ZIP manifest is not valid JSON.');
  }
  const parsedManifest = csvManifestSchema.safeParse(manifestRaw);
  if (!parsedManifest.success) {
    throw new TransferFileError(
      'The ZIP manifest is invalid or unsupported.',
      formatZodIssues(parsedManifest.error),
    );
  }
  const manifest = parsedManifest.data;
  const manifestPaths = manifest.files.map(({ path }) => path);
  if (new Set(manifestPaths).size !== manifestPaths.length) {
    throw new TransferFileError('The ZIP manifest contains duplicate file paths.');
  }
  const declaredPaths = new Set(['manifest.json', ...manifest.files.map(({ path }) => path)]);
  if (Object.keys(files).some((path) => !declaredPaths.has(path))) {
    throw new TransferFileError('The ZIP archive contains undeclared files.');
  }
  const profiles = new Map(manifest.profiles.map((profile) => [profile.id, profile]));
  const parts: Parameters<typeof bundleFromCsvParts>[1] = [];
  for (const entry of manifest.files) {
    const profile = profiles.get(entry.profileId);
    const content = files[entry.path];
    if (!profile || !content)
      throw new TransferFileError(`The manifest entry ${entry.path} is incomplete.`);
    const text = strFromU8(content);
    if ((await sha256Bytes(content)) !== entry.sha256) {
      throw new TransferFileError(`Checksum validation failed for ${entry.path}.`);
    }
    const parsedCsv = parseTransferCsv(text);
    if (parsedCsv.dataset !== entry.dataset) {
      throw new TransferFileError(`${entry.path} does not match its declared dataset.`);
    }
    if (parsedCsv.missingHeaders.length) {
      throw new TransferFileError(
        `${entry.path} is missing required columns: ${parsedCsv.missingHeaders.join(', ')}.`,
      );
    }
    if (parsedCsv.rows.length !== entry.recordCount) {
      throw new TransferFileError(`${entry.path} does not match its declared record count.`);
    }
    parts.push({
      name: entry.path,
      profile,
      dataset: entry.dataset,
      rows: parsedCsv.rows,
      parserIssues: parsedCsv.errors.map((error) => ({
        severity: 'warning',
        file: entry.path,
        row: error.row,
        message: error.message,
      })),
    });
  }
  const result = bundleFromCsvParts(manifest.profiles, parts, {
    exportId: manifest.exportId,
    exportedAt: manifest.exportedAt,
    appVersion: manifest.appVersion,
    dateRange: manifest.selection.dateRange,
  });
  return { ...result, format: 'csv-zip' };
}

async function parseRawCsv(
  db: SQLiteDatabase,
  text: string,
  source: ImportSourceFile,
  targetProfileId?: string,
): Promise<ParsedImportFile> {
  if (!targetProfileId)
    throw new TransferFileError('Choose a target profile before importing a CSV file.');
  const [profile] = await loadProfilesForExport(db, [targetProfileId]);
  if (!profile) throw new TransferFileError('The selected target profile no longer exists.');
  const parsed = parseTransferCsv(text);
  if (!parsed.dataset)
    throw new TransferFileError('The CSV headers do not identify a workout or BMI file.');
  if (parsed.missingHeaders.length) {
    throw new TransferFileError(
      `The CSV is missing required columns: ${parsed.missingHeaders.join(', ')}.`,
    );
  }
  return bundleFromCsvParts(
    [profile],
    [
      {
        name: source.name,
        profile,
        dataset: parsed.dataset,
        rows: parsed.rows,
        parserIssues: parsed.errors.map((error) => ({
          severity: 'warning',
          file: source.name,
          row: error.row,
          message: error.message,
        })),
      },
    ],
    {
      exportId: `csv-${Date.now()}`,
      exportedAt: Date.now(),
      appVersion: 'external-csv',
      dateRange: null,
    },
  );
}

export async function parseImportFile(
  db: SQLiteDatabase,
  source: ImportSourceFile,
  rawCsvTargetProfileId?: string,
): Promise<ParsedImportFile> {
  assertFileSize(source);
  const file = new File(source.uri);
  const size = source.size ?? file.size;
  if (size !== null && size > MAX_TRANSFER_FILE_BYTES) {
    throw new TransferFileError('The selected file is larger than the 25 MB import limit.');
  }
  const name = source.name.toLowerCase();
  if (name.endsWith('.zip')) return parseZipBundle(await file.bytes());
  const text = await file.text();
  if (name.endsWith('.json')) return parseJsonBundle(text);
  if (name.endsWith('.csv')) return parseRawCsv(db, text, source, rawCsvTargetProfileId);
  throw new TransferFileError('Choose a .csv, .zip, or .json file.');
}

export function purgeTransferCache(): void {
  const directory = new Directory(Paths.cache, TRANSFER_DIRECTORY_NAME);
  if (!directory.exists) return;
  for (const entry of directory.list()) {
    try {
      entry.delete();
    } catch {
      // Cache cleanup is best effort and must never block the feature.
    }
  }
}

export function deleteTransferArtifact(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Cache cleanup is best effort and must never hide a completed share.
  }
}

export { sha256Text };
