import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import React from 'react';
import { Alert } from 'react-native';

import { useDataChange } from '@/data/data-change-context';
import { useProfiles } from '@/data/profile-context';
import { dataTransferService } from '@/features/data-transfer/data-transfer-service';
import DataSyncScreen from '@/screens/data-sync-screen';

const mockDatabase = {};
const mockRefreshProfiles = jest.fn(async () => undefined);
const mockNotifyDataChanged = jest.fn();
let mockProfiles = [{ id: 'profile-1', name: 'Alex' }];
let mockSelectedProfile = mockProfiles[0];

jest.mock('expo-sqlite', () => ({ useSQLiteContext: () => mockDatabase }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('@react-native-vector-icons/material-design-icons', () => ({
  MaterialDesignIcons: () => null,
}));
jest.mock('@/data/data-change-context', () => ({ useDataChange: jest.fn() }));
jest.mock('@/data/profile-context', () => ({ useProfiles: jest.fn() }));
jest.mock('@/features/data-transfer/data-transfer-service', () => ({
  TransferFileError: class TransferFileError extends Error {},
  dataTransferService: {
    createExport: jest.fn(),
    countExport: jest.fn(),
    createTemplate: jest.fn(),
    inspectImport: jest.fn(),
    applyImport: jest.fn(),
    purgeCache: jest.fn(),
    deleteArtifact: jest.fn(),
  },
}));
jest.mock('@/utils/feedback', () => ({
  successFeedback: jest.fn(),
  warningFeedback: jest.fn(),
}));
jest.mock('@/utils/telemetry', () => ({ track: jest.fn() }));

const counts = {
  profiles: 1,
  sessions: 2,
  exercises: 3,
  sets: 4,
  bmiMeasurements: 5,
  supersets: 1,
  templates: 1,
};

describe('DataSyncScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProfiles = [{ id: 'profile-1', name: 'Alex' }];
    mockSelectedProfile = mockProfiles[0];
    jest.mocked(useProfiles).mockReturnValue({
      profiles: mockProfiles,
      selectedProfile: mockSelectedProfile,
      loading: false,
      refreshProfiles: mockRefreshProfiles,
      selectProfile: jest.fn(),
    } as never);
    jest.mocked(useDataChange).mockReturnValue({
      version: 0,
      notifyDataChanged: mockNotifyDataChanged,
    });
    jest.mocked(dataTransferService.countExport).mockResolvedValue(counts);
    jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(true);
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('defaults to the active profile, both datasets, and shows schema-backed templates', async () => {
    const view = await render(<DataSyncScreen />);

    expect(view.queryByTestId('export-profile-profile-1')).toBeNull();
    expect(view.getByTestId('export-profile-input-value').props.children).toBe('Alex');
    await fireEvent.press(view.getByTestId('export-profile-input'));
    expect(view.getByTestId('export-profile-profile-1')).toHaveProp('accessibilityState', {
      checked: true,
    });
    expect(view.getByTestId('csv-target-profile-input-value').props.children).toBe('Alex');
    expect(view.getByTestId('export-workouts')).toHaveProp('accessibilityState', {
      checked: true,
    });
    expect(view.getByTestId('export-bmi')).toHaveProp('accessibilityState', {
      checked: true,
    });
    expect(view.getByText('session_started_at')).toBeTruthy();
    expect(
      view.getByText(
        'Use UTF-8 CSV. Keep the header names unchanged. Use one row per set, leave set fields blank for an exercise without sets, and fill only the fields that match the selected set kind.',
      ),
    ).toBeTruthy();
    await waitFor(() => expect(view.getByText('4')).toBeTruthy());
    expect(dataTransferService.purgeCache).toHaveBeenCalledTimes(1);
    expect(dataTransferService.countExport).toHaveBeenCalledWith(
      mockDatabase,
      expect.objectContaining({
        profileIds: ['profile-1'],
        datasets: ['workouts', 'bmi'],
        dateRange: null,
      }),
    );
  });

  test('selects multiple export profiles through the list input', async () => {
    mockProfiles = [
      { id: 'profile-1', name: 'Alex' },
      { id: 'profile-2', name: 'Sam' },
    ];
    mockSelectedProfile = mockProfiles[0];
    jest.mocked(useProfiles).mockReturnValue({
      profiles: mockProfiles,
      selectedProfile: mockSelectedProfile,
      loading: false,
      refreshProfiles: mockRefreshProfiles,
      selectProfile: jest.fn(),
    } as never);
    const view = await render(<DataSyncScreen />);

    await fireEvent.press(view.getByTestId('export-profile-input'));
    await fireEvent.press(view.getByTestId('export-profile-profile-2'));

    expect(view.getByTestId('export-profile-input-value').props.children).toBe(
      '2 profiles selected',
    );
    await waitFor(() =>
      expect(dataTransferService.countExport).toHaveBeenLastCalledWith(
        mockDatabase,
        expect.objectContaining({ profileIds: ['profile-1', 'profile-2'] }),
      ),
    );

    expect(view.queryByTestId('csv-target-profile-2')).toBeNull();
    await fireEvent.press(view.getByTestId('csv-target-profile-input'));
    await fireEvent.press(view.getByTestId('csv-target-profile-2'));
    expect(view.getByTestId('csv-target-profile-input-value').props.children).toBe('Sam');
    expect(view.queryByTestId('csv-target-profile-input-options')).toBeNull();
  });

  test('creates, shares, and cleans up an export artifact', async () => {
    jest.mocked(dataTransferService.createExport).mockResolvedValue({
      uri: 'file://export.zip',
      filename: 'export.zip',
      mimeType: 'application/zip',
      size: 10,
      checksum: 'abc',
      counts,
    });
    const view = await render(<DataSyncScreen />);

    await fireEvent.press(view.getByTestId('create-data-export'));

    await waitFor(() =>
      expect(Sharing.shareAsync).toHaveBeenCalledWith(
        'file://export.zip',
        expect.objectContaining({ mimeType: 'application/zip' }),
      ),
    );
    expect(dataTransferService.deleteArtifact).toHaveBeenCalledWith('file://export.zip');
  });

  test('previews an import, confirms warnings, applies it, and refreshes shared data', async () => {
    jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file://backup.json',
          name: 'backup.json',
          size: 123,
          mimeType: 'application/json',
          lastModified: 1,
        },
      ],
    });
    const preview = {
      id: 'preview-1',
      fileName: 'backup.json',
      format: 'json',
      datasets: ['workouts', 'bmi'],
      dateRange: { start: '2026-09-01', end: '2026-09-12' },
      dateCoverage: { start: '2026-09-03', end: '2026-09-10' },
      profiles: [{ id: 'profile-2', name: 'Sam', action: 'create' }],
      counts: { additions: 8, updates: 1, unchanged: 2, conflicts: 1, invalid: 1 },
      datasetCounts: {
        workouts: { additions: 6, updates: 1, unchanged: 2, conflicts: 1, invalid: 1 },
        bmi: { additions: 1, updates: 0, unchanged: 0, conflicts: 0, invalid: 0 },
      },
      issues: [{ severity: 'warning', file: 'workouts.csv', row: 4, message: 'Bad row' }],
      canImport: true,
      requiresWarningConfirmation: true,
      bundle: {},
      naturalRecordIds: [],
      conflictRecordKeys: [],
    } as never;
    const result = {
      additions: 8,
      updates: 1,
      unchanged: 2,
      conflicts: 1,
      invalid: 1,
      failed: 0,
    };
    jest.mocked(dataTransferService.inspectImport).mockResolvedValue(preview);
    jest.mocked(dataTransferService.applyImport).mockResolvedValue(result);
    jest.spyOn(Alert, 'alert').mockImplementation((title, _message, buttons) => {
      if (title === 'Import these changes?') buttons?.[1]?.onPress?.();
    });
    const view = await render(<DataSyncScreen />);

    await fireEvent.press(view.getByTestId('choose-import-file'));
    expect(await view.findByTestId('import-preview')).toBeTruthy();
    expect(view.getByText('Sam: create')).toBeTruthy();
    expect(view.getByText('workouts.csv, row 4: Bad row')).toBeTruthy();

    await fireEvent.press(view.getByTestId('apply-data-import'));
    await waitFor(() => expect(view.getByText('Import complete')).toBeTruthy());
    expect(dataTransferService.applyImport).toHaveBeenCalledWith(mockDatabase, preview);
    expect(mockRefreshProfiles).toHaveBeenCalledTimes(1);
    expect(mockNotifyDataChanged).toHaveBeenCalledTimes(1);
  });

  test('keeps import available without profiles while export stays disabled', async () => {
    mockProfiles = [];
    jest.mocked(useProfiles).mockReturnValue({
      profiles: [],
      selectedProfile: null,
      loading: false,
      refreshProfiles: mockRefreshProfiles,
      selectProfile: jest.fn(),
    } as never);
    const view = await render(<DataSyncScreen />);

    expect(view.getByTestId('create-data-export')).toBeDisabled();
    expect(view.getByTestId('choose-import-file')).not.toBeDisabled();
    expect(
      view.getByText(
        'There are no profiles to export. You can still import a Fitness Trail JSON backup below.',
      ),
    ).toBeTruthy();
  });
});
