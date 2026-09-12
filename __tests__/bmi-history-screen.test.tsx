import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import React from 'react';
import { Alert } from 'react-native';

import {
  type BmiMeasurementCursor,
  type BmiMeasurementPage,
  bmiRepository,
} from '@/data/bmi-repository';
import BmiHistoryScreen from '@/screens/bmi-history-screen';
import type { BmiMeasurement } from '@/types/bmi';

jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  return {
    router: { push: jest.fn(), replace: jest.fn() },
    useFocusEffect: (callback: () => void) => React.useEffect(callback, [callback]),
  };
});

const mockDatabase = {};
jest.mock('expo-sqlite', () => ({ useSQLiteContext: () => mockDatabase }));
jest.mock('@react-native-vector-icons/material-design-icons', () => ({
  MaterialDesignIcons: () => null,
}));
jest.mock('@/components/selected-profile-card', () => ({
  SelectedProfileCard: () => null,
}));
jest.mock('@/components/swipe-action-row', () => ({
  SwipeActionRow: ({ children, onDelete }: React.PropsWithChildren<{ onDelete: () => void }>) => {
    const { Pressable } = jest.requireActual('react-native');
    return (
      <>
        {children}
        <Pressable testID="delete-bmi-row" onPress={onDelete} />
      </>
    );
  },
}));

const mockNotifyDataChanged = jest.fn();
let mockDataVersion = 0;
jest.mock('@/data/data-change-context', () => ({
  useDataChange: () => ({
    version: mockDataVersion,
    notifyDataChanged: mockNotifyDataChanged,
  }),
}));

let mockSelectedProfile: { id: string; name: string } | null = {
  id: 'profile-1',
  name: 'Profile One',
};
jest.mock('@/data/profile-context', () => ({
  useProfiles: () => ({ selectedProfile: mockSelectedProfile, loading: false }),
}));
jest.mock('@/data/bmi-repository', () => ({
  bmiRepository: { listPage: jest.fn(), remove: jest.fn() },
}));

function measurement(id: string, measuredAt: number): BmiMeasurement {
  return {
    id,
    profileId: mockSelectedProfile?.id ?? 'profile-1',
    measuredAt,
    localDate: '2026-09-12',
    timezoneOffsetMinutes: -330,
    inputWeight: 70,
    inputWeightUnit: 'kg',
    weightKg: 70,
    weightLb: 154.3234,
    inputHeightUnit: 'cm',
    heightCm: 175,
    ageYears: 30,
    gender: 'prefer_not_to_say',
    bmi: 22.9,
    createdAt: measuredAt,
    updatedAt: measuredAt,
  };
}

const nextCursor: BmiMeasurementCursor = {
  measuredAt: 196,
  createdAt: 196,
  id: 'measurement-4',
};

describe('BmiHistoryScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(bmiRepository.listPage).mockReset();
    jest.mocked(bmiRepository.remove).mockReset();
    mockDataVersion = 0;
    mockSelectedProfile = { id: 'profile-1', name: 'Profile One' };
  });

  test('loads and appends pages once, then stops at the final page', async () => {
    const firstPage = Array.from({ length: 5 }, (_, index) =>
      measurement(`measurement-${index}`, 200 - index),
    );
    const secondPage = Array.from({ length: 3 }, (_, index) =>
      measurement(`measurement-${index + 5}`, 80 - index),
    );
    let resolveSecondPage: (page: BmiMeasurementPage) => void = () => undefined;
    const secondPagePromise = new Promise<BmiMeasurementPage>((resolve) => {
      resolveSecondPage = resolve;
    });
    jest
      .mocked(bmiRepository.listPage)
      .mockResolvedValueOnce({ measurements: firstPage, nextCursor })
      .mockReturnValueOnce(secondPagePromise);

    const view = await render(<BmiHistoryScreen />);

    await waitFor(() => expect(view.getByTestId('bmi-history-measurement-4')).toBeTruthy());
    await fireEvent(view.getByTestId('bmi-history-list'), 'onEndReached');
    await fireEvent(view.getByTestId('bmi-history-list'), 'onEndReached');
    expect(bmiRepository.listPage).toHaveBeenCalledTimes(2);
    resolveSecondPage({ measurements: secondPage, nextCursor: null });

    await waitFor(() => expect(view.getByTestId('bmi-history-measurement-7')).toBeTruthy());
    expect(bmiRepository.listPage).toHaveBeenCalledTimes(2);
    expect(bmiRepository.listPage).toHaveBeenLastCalledWith(
      mockDatabase,
      'profile-1',
      20,
      nextCursor,
    );

    await fireEvent(view.getByTestId('bmi-history-list'), 'onEndReached');
    expect(bmiRepository.listPage).toHaveBeenCalledTimes(2);
  });

  test('keeps edit and confirmed delete actions on history rows', async () => {
    const savedMeasurement = measurement('saved', 100);
    jest.mocked(bmiRepository.listPage).mockResolvedValue({
      measurements: [savedMeasurement],
      nextCursor: null,
    });
    jest.mocked(bmiRepository.remove).mockResolvedValue();
    const alert = jest.spyOn(Alert, 'alert');

    const view = await render(<BmiHistoryScreen />);
    await waitFor(() => expect(view.getByTestId('bmi-history-saved')).toBeTruthy());

    await fireEvent.press(view.getByTestId('bmi-history-saved'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/bmi/measurements/[measurementId]',
      params: { measurementId: 'saved' },
    });

    await fireEvent.press(view.getByTestId('delete-bmi-row'));
    const actions = alert.mock.calls.at(-1)?.[2];
    actions?.find((action) => action.text === 'Delete')?.onPress?.();

    await waitFor(() => expect(bmiRepository.remove).toHaveBeenCalled());
    await waitFor(() => expect(view.queryByTestId('bmi-history-saved')).toBeNull());
    expect(mockNotifyDataChanged).toHaveBeenCalledTimes(1);

    mockDataVersion = 1;
    await view.rerender(<BmiHistoryScreen />);
    expect(bmiRepository.listPage).toHaveBeenCalledTimes(1);
  });

  test('reloads from the first page when the active profile changes', async () => {
    jest
      .mocked(bmiRepository.listPage)
      .mockResolvedValueOnce({ measurements: [measurement('profile-1-entry', 100)], nextCursor })
      .mockResolvedValueOnce({
        measurements: [{ ...measurement('profile-2-entry', 200), profileId: 'profile-2' }],
        nextCursor: null,
      });

    const view = await render(<BmiHistoryScreen />);
    await waitFor(() => expect(view.getByTestId('bmi-history-profile-1-entry')).toBeTruthy());

    mockSelectedProfile = { id: 'profile-2', name: 'Profile Two' };
    await view.rerender(<BmiHistoryScreen />);

    await waitFor(() => expect(view.getByTestId('bmi-history-profile-2-entry')).toBeTruthy());
    expect(view.queryByTestId('bmi-history-profile-1-entry')).toBeNull();
    expect(bmiRepository.listPage).toHaveBeenLastCalledWith(mockDatabase, 'profile-2', 20);
  });

  test('reloads from the first page after an external BMI data change', async () => {
    jest
      .mocked(bmiRepository.listPage)
      .mockResolvedValueOnce({
        measurements: [measurement('original-entry', 100)],
        nextCursor: null,
      })
      .mockResolvedValueOnce({
        measurements: [measurement('updated-entry', 200)],
        nextCursor: null,
      });

    const view = await render(<BmiHistoryScreen />);
    await waitFor(() => expect(view.getByTestId('bmi-history-original-entry')).toBeTruthy());

    mockDataVersion = 1;
    await view.rerender(<BmiHistoryScreen />);

    await waitFor(() => expect(view.getByTestId('bmi-history-updated-entry')).toBeTruthy());
    expect(view.queryByTestId('bmi-history-original-entry')).toBeNull();
    expect(bmiRepository.listPage).toHaveBeenCalledTimes(2);
  });
});
