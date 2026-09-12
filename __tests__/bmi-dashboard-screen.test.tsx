import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';

import { bmiRepository } from '@/data/bmi-repository';
import BmiDashboardScreen from '@/screens/bmi-dashboard-screen';
import type { BmiMeasurement } from '@/types/bmi';

jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  return {
    router: { push: jest.fn() },
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
  SwipeActionRow: ({ children }: React.PropsWithChildren) => children,
}));
jest.mock('@/data/data-change-context', () => ({
  useDataChange: () => ({ version: 0, notifyDataChanged: jest.fn() }),
}));
const mockSelectedProfile = { id: 'profile-1' };
jest.mock('@/data/profile-context', () => ({
  useProfiles: () => ({
    selectedProfile: mockSelectedProfile,
    loading: false,
  }),
}));
jest.mock('@/data/bmi-repository', () => ({
  bmiRepository: { listAll: jest.fn(), remove: jest.fn() },
}));

function measurement(
  id: string,
  measuredAt: number,
  values: {
    inputWeight: number;
    inputWeightUnit: 'kg' | 'lb';
    weightKg: number;
    weightLb: number;
    bmi: number;
  },
): BmiMeasurement {
  return {
    id,
    profileId: 'profile-1',
    measuredAt,
    localDate: '2026-09-12',
    timezoneOffsetMinutes: -330,
    ...values,
    inputHeightUnit: 'cm',
    heightCm: 175,
    ageYears: 30,
    gender: 'prefer_not_to_say',
    createdAt: measuredAt,
    updatedAt: measuredAt,
  };
}

describe('BmiDashboardScreen range averages', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('defaults to one week and recalculates both averages when the range changes', async () => {
    const now = Date.now();
    const recent = measurement('recent', now - 24 * 60 * 60 * 1000, {
      inputWeight: 70,
      inputWeightUnit: 'kg',
      weightKg: 70,
      weightLb: 154.3234,
      bmi: 20,
    });
    const older = measurement('older', now - 20 * 24 * 60 * 60 * 1000, {
      inputWeight: 176.3696,
      inputWeightUnit: 'lb',
      weightKg: 80,
      weightLb: 176.3696,
      bmi: 30,
    });
    jest.mocked(bmiRepository.listAll).mockResolvedValue([recent, older]);

    const view = await render(<BmiDashboardScreen />);

    await waitFor(() => expect(view.getByTestId('average-bmi-value').props.children).toBe('20.0'));
    expect(view.getByTestId('bmi-range-control')).toHaveProp('selectedIndex', 0);
    expect(view.getByTestId('average-weight-value').props.children).toBe('70.00 kg');

    await fireEvent(view.getByTestId('bmi-metric-control'), 'onChange', {
      nativeEvent: { selectedSegmentIndex: 1 },
    });
    expect(view.getByTestId('average-bmi-value').props.children).toBe('20.0');
    expect(view.getByTestId('average-weight-value').props.children).toBe('70.00 kg');

    await fireEvent(view.getByTestId('bmi-range-control'), 'onChange', {
      nativeEvent: { selectedSegmentIndex: 1 },
    });

    await waitFor(() => expect(view.getByTestId('average-bmi-value').props.children).toBe('25.0'));
    expect(view.getByTestId('average-weight-value').props.children).toBe('75.00 kg');
  });

  test('shows no data for both averages when the selected range is empty', async () => {
    const older = measurement('older', Date.now() - 20 * 24 * 60 * 60 * 1000, {
      inputWeight: 176.3696,
      inputWeightUnit: 'lb',
      weightKg: 80,
      weightLb: 176.3696,
      bmi: 30,
    });
    jest.mocked(bmiRepository.listAll).mockResolvedValue([older]);

    const view = await render(<BmiDashboardScreen />);

    await waitFor(() =>
      expect(view.getByTestId('average-bmi-value').props.children).toBe('No data'),
    );
    expect(view.getByTestId('average-weight-value').props.children).toBe('No data');
  });
});
