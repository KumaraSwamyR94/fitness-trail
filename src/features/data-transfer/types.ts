import type { TransferBundle } from '@/features/data-transfer/schemas';

export type TransferDataset = 'workouts' | 'bmi';
export type TransferFormat = 'csv-zip' | 'fitness-trail-json';

export interface TransferDateRange {
  start: string;
  end: string;
}

export interface ExportOptions {
  profileIds: string[];
  datasets: TransferDataset[];
  format: TransferFormat;
  dateRange: TransferDateRange | null;
}

export interface TransferCounts {
  profiles: number;
  sessions: number;
  exercises: number;
  sets: number;
  bmiMeasurements: number;
  supersets: number;
  templates: number;
}

export interface ExportArtifact {
  uri: string;
  filename: string;
  mimeType: string;
  size: number;
  checksum: string;
  counts: TransferCounts;
}

export interface ImportSourceFile {
  uri: string;
  name: string;
  size?: number | null;
  mimeType?: string | null;
}

export interface TransferIssue {
  severity: 'error' | 'warning';
  message: string;
  file?: string;
  row?: number;
  column?: string;
}

export interface ImportActionCounts {
  additions: number;
  updates: number;
  unchanged: number;
  conflicts: number;
  invalid: number;
}

export interface ImportProfilePreview {
  id: string;
  name: string;
  action: 'create' | 'update' | 'unchanged';
}

export interface ImportPreview {
  id: string;
  fileName: string;
  format: 'json' | 'csv' | 'csv-zip';
  datasets: TransferDataset[];
  dateRange: TransferDateRange | null;
  dateCoverage: TransferDateRange | null;
  profiles: ImportProfilePreview[];
  counts: ImportActionCounts;
  datasetCounts: Record<TransferDataset, ImportActionCounts>;
  issues: TransferIssue[];
  canImport: boolean;
  requiresWarningConfirmation: boolean;
  bundle: TransferBundle;
  naturalRecordIds: string[];
  conflictRecordKeys: string[];
}

export interface ImportResult extends ImportActionCounts {
  failed: number;
}

export const EMPTY_TRANSFER_COUNTS: TransferCounts = {
  profiles: 0,
  sessions: 0,
  exercises: 0,
  sets: 0,
  bmiMeasurements: 0,
  supersets: 0,
  templates: 0,
};
