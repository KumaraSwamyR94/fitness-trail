import { createHash as mockCreateHash } from 'node:crypto';

import { strToU8, zipSync } from 'fflate';

import { BMI_SAMPLE_ROW, createTemplateCsv } from '@/features/data-transfer/csv';
import {
  MAX_TRANSFER_FILE_BYTES,
  parseImportFile,
  TransferFileError,
} from '@/features/data-transfer/file-codec';

const mockFileContents = new Map<string, Uint8Array | string>();

jest.mock('expo-file-system', () => {
  class MockFile {
    readonly uri: string;

    constructor(uri: string) {
      this.uri = uri;
    }

    get size(): number | null {
      const value = mockFileContents.get(this.uri);
      if (value === undefined) return null;
      return typeof value === 'string' ? new TextEncoder().encode(value).length : value.length;
    }

    async text(): Promise<string> {
      const value = mockFileContents.get(this.uri);
      if (value === undefined) throw new Error('Missing mock file');
      return typeof value === 'string' ? value : new TextDecoder().decode(value);
    }

    async bytes(): Promise<Uint8Array> {
      const value = mockFileContents.get(this.uri);
      if (value === undefined) throw new Error('Missing mock file');
      return typeof value === 'string' ? new TextEncoder().encode(value) : value;
    }
  }

  return {
    Directory: class {},
    File: MockFile,
    Paths: { cache: 'memory://cache' },
  };
});

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digest: jest.fn(async (_algorithm: string, value: Uint8Array) => {
    const bytes = mockCreateHash('sha256').update(value).digest();
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }),
  digestStringAsync: jest.fn(async (_algorithm: string, value: string) =>
    mockCreateHash('sha256').update(value).digest('hex'),
  ),
  randomUUID: jest.fn(() => 'generated-id'),
}));

const profile = {
  id: 'profile-1',
  name: 'Alex',
  age_source: 'age' as const,
  age_years: 30,
  date_of_birth: null,
  gender: 'prefer_not_to_say' as const,
  input_height_unit: 'cm' as const,
  height_cm: 175,
  created_at: 1,
  updated_at: 1,
};

function emptyBundle() {
  return {
    format: 'fitness-trail-backup',
    formatVersion: 1,
    exportId: 'export-1',
    exportedAt: 1,
    appVersion: '1.0.0',
    selection: { datasets: ['bmi'], dateRange: null },
    profiles: [profile],
    data: {
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
    },
  };
}

function fakeDatabase() {
  return {
    getAllAsync: jest.fn(async () => [profile]),
  } as never;
}

describe('data transfer file validation', () => {
  beforeEach(() => {
    mockFileContents.clear();
  });

  test('accepts supported JSON and rejects future format versions', async () => {
    mockFileContents.set('memory://backup.json', JSON.stringify(emptyBundle()));
    await expect(
      parseImportFile(fakeDatabase(), {
        uri: 'memory://backup.json',
        name: 'backup.json',
      }),
    ).resolves.toMatchObject({ format: 'json', invalidRowCount: 0 });

    mockFileContents.set(
      'memory://future.json',
      JSON.stringify({ ...emptyBundle(), formatVersion: 2 }),
    );
    await expect(
      parseImportFile(fakeDatabase(), {
        uri: 'memory://future.json',
        name: 'future.json',
      }),
    ).rejects.toThrow('unsupported version');
  });

  test('rejects files above the size limit before reading them', async () => {
    await expect(
      parseImportFile(fakeDatabase(), {
        uri: 'memory://large.json',
        name: 'large.json',
        size: MAX_TRANSFER_FILE_BYTES + 1,
      }),
    ).rejects.toBeInstanceOf(TransferFileError);
  });

  test('rejects archive traversal paths', async () => {
    mockFileContents.set(
      'memory://unsafe.zip',
      zipSync({
        'manifest.json': strToU8('{}'),
        '../workouts.csv': strToU8('unsafe'),
      }),
    );

    await expect(
      parseImportFile(fakeDatabase(), {
        uri: 'memory://unsafe.zip',
        name: 'unsafe.zip',
      }),
    ).rejects.toThrow('Unsafe or unexpected archive path');
  });

  test('checks ZIP entry checksums and declared row counts', async () => {
    const csv = createTemplateCsv('bmi', true);
    const path = 'profiles/profile-1/bmi.csv';
    const manifest = {
      format: 'fitness-trail-csv-bundle',
      formatVersion: 1,
      exportId: 'export-1',
      exportedAt: 1,
      appVersion: '1.0.0',
      selection: { datasets: ['bmi'], dateRange: null },
      profiles: [profile],
      files: [
        {
          path,
          dataset: 'bmi',
          profileId: profile.id,
          sha256: mockCreateHash('sha256').update(strToU8(csv)).digest('hex'),
          recordCount: 2,
        },
      ],
    };
    mockFileContents.set(
      'memory://count.zip',
      zipSync({
        'manifest.json': strToU8(JSON.stringify(manifest)),
        [path]: strToU8(csv),
      }),
    );
    await expect(
      parseImportFile(fakeDatabase(), { uri: 'memory://count.zip', name: 'count.zip' }),
    ).rejects.toThrow('declared record count');

    manifest.files[0].recordCount = 1;
    manifest.files[0].sha256 = '0'.repeat(64);
    mockFileContents.set(
      'memory://checksum.zip',
      zipSync({
        'manifest.json': strToU8(JSON.stringify(manifest)),
        [path]: strToU8(csv),
      }),
    );
    await expect(
      parseImportFile(fakeDatabase(), {
        uri: 'memory://checksum.zip',
        name: 'checksum.zip',
      }),
    ).rejects.toThrow('Checksum validation failed');
  });

  test('reports invalid CSV rows while preserving valid independent rows', async () => {
    const csv = createTemplateCsv('bmi', true);
    const invalidRow = { ...BMI_SAMPLE_ROW, measured_at: 'not-a-date' };
    const secondCsv = `${csv}\r\n${Object.values(invalidRow).join(',')}`;
    mockFileContents.set('memory://bmi.csv', secondCsv);

    const parsed = await parseImportFile(
      fakeDatabase(),
      { uri: 'memory://bmi.csv', name: 'bmi.csv' },
      profile.id,
    );
    expect(parsed.bundle.data.bmiMeasurements).toHaveLength(1);
    expect(parsed.invalidRowCount).toBe(1);
    expect(parsed.issues[0]).toMatchObject({ severity: 'warning', row: 3 });
  });
});
