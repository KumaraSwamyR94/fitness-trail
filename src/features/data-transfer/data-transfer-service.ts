import type { SQLiteDatabase } from 'expo-sqlite';

import { createTransferBundle } from '@/features/data-transfer/bundle';
import {
  createExportArtifact,
  createTemplateArtifact,
  deleteTransferArtifact,
  parseImportFile,
  purgeTransferCache,
  TransferFileError,
} from '@/features/data-transfer/file-codec';
import { applyImportPreview, createImportPreview } from '@/features/data-transfer/merge';
import { countsForData } from '@/features/data-transfer/repository';
import type {
  ExportArtifact,
  ExportOptions,
  ImportPreview,
  ImportResult,
  ImportSourceFile,
  TransferDataset,
} from '@/features/data-transfer/types';

export const dataTransferService = {
  createExport(db: SQLiteDatabase, options: ExportOptions): Promise<ExportArtifact> {
    return createExportArtifact(db, options);
  },

  async countExport(db: SQLiteDatabase, options: ExportOptions) {
    const bundle = await createTransferBundle(db, options);
    return countsForData(bundle.profiles, bundle.data);
  },

  createTemplate(dataset: TransferDataset): Promise<ExportArtifact> {
    return createTemplateArtifact(dataset);
  },

  async inspectImport(
    db: SQLiteDatabase,
    file: ImportSourceFile,
    rawCsvTargetProfileId?: string,
  ): Promise<ImportPreview> {
    const parsed = await parseImportFile(db, file, rawCsvTargetProfileId);
    return createImportPreview(db, parsed, file.name);
  },

  applyImport(db: SQLiteDatabase, preview: ImportPreview): Promise<ImportResult> {
    return applyImportPreview(db, preview);
  },

  purgeCache(): void {
    purgeTransferCache();
  },

  deleteArtifact(uri: string): void {
    deleteTransferArtifact(uri);
  },
};

export { TransferFileError };
export type {
  ExportArtifact,
  ExportOptions,
  ImportPreview,
  ImportResult,
  ImportSourceFile,
  TransferDataset,
} from '@/features/data-transfer/types';
