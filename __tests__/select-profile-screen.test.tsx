import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import React from 'react';
import { Alert } from 'react-native';

import { profileRepository } from '@/data/profile-repository';
import SelectProfileScreen from '@/screens/select-profile-screen';
import type { Profile } from '@/types/profile';

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
jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'Light' },
  impactAsync: jest.fn(),
}));
jest.mock('@/components/profile-avatar', () => ({ ProfileAvatar: () => null }));
jest.mock('@/utils/feedback', () => ({
  successFeedback: jest.fn(),
  warningFeedback: jest.fn(),
}));
jest.mock('@/utils/profile-media', () => ({ removePrivateProfilePhoto: jest.fn() }));
jest.mock('@/utils/telemetry', () => ({ track: jest.fn() }));

const mockNotifyDataChanged = jest.fn();
jest.mock('@/data/data-change-context', () => ({
  useDataChange: () => ({ version: 0, notifyDataChanged: mockNotifyDataChanged }),
}));

const mockRefreshProfiles = jest.fn(async () => undefined);
const mockSelectProfile = jest.fn(async () => undefined);
let mockProfiles: Profile[] = [];
let mockSelectedProfile: Profile | null = null;
jest.mock('@/data/profile-context', () => ({
  useProfiles: () => ({
    profiles: mockProfiles,
    selectedProfile: mockSelectedProfile,
    loading: false,
    refreshProfiles: mockRefreshProfiles,
    selectProfile: mockSelectProfile,
  }),
}));

jest.mock('@/data/profile-repository', () => ({
  profileRepository: {
    getOverview: jest.fn(),
    remove: jest.fn(),
  },
}));

function profile(id: string, name: string): Profile {
  return {
    id,
    name,
    ageSource: 'age',
    ageYears: 30,
    dateOfBirth: null,
    gender: 'prefer_not_to_say',
    inputHeightUnit: 'cm',
    heightCm: 175,
    photo: { kind: 'none', ref: null },
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('SelectProfileScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProfiles = [];
    mockSelectedProfile = null;
  });

  test('renders exactly one create action for empty and populated states', async () => {
    const view = await render(<SelectProfileScreen />);

    expect(view.getAllByTestId('add-profile')).toHaveLength(1);
    await fireEvent.press(view.getByTestId('add-profile'));
    expect(router.push).toHaveBeenCalledWith('/profiles/new');

    mockProfiles = [profile('profile-1', 'Alex')];
    mockSelectedProfile = mockProfiles[0];
    await view.rerender(<SelectProfileScreen />);

    expect(view.getAllByTestId('add-profile')).toHaveLength(1);
  });

  test('keeps select, edit, and confirmed delete actions on every profile row', async () => {
    const alex = profile('profile-1', 'Alex');
    const sam = profile('profile-2', 'Sam');
    mockProfiles = [alex, sam];
    mockSelectedProfile = alex;
    jest.mocked(profileRepository.getOverview).mockResolvedValue({
      ...sam,
      sessionCount: 2,
      exerciseCount: 3,
      setCount: 4,
      bmiMeasurementCount: 1,
      latestBmi: null,
      latestWeight: null,
      latestWeightUnit: null,
    });
    jest.mocked(profileRepository.remove).mockResolvedValue(null);
    const alert = jest.spyOn(Alert, 'alert');

    const view = await render(<SelectProfileScreen />);

    await fireEvent.press(view.getByTestId('select-profile-profile-2'));
    expect(mockSelectProfile).toHaveBeenCalledWith('profile-2');

    await fireEvent.press(view.getByTestId('edit-profile-profile-2'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/profiles/[profileId]',
      params: { profileId: 'profile-2' },
    });

    await fireEvent.press(view.getByTestId('delete-profile-profile-2'));
    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith('Delete Sam?', expect.any(String), expect.any(Array)),
    );
    await act(async () => {
      alert.mock.calls
        .at(-1)?.[2]
        ?.find((action) => action.text === 'Delete Profile and Data')
        ?.onPress?.();
    });

    await waitFor(() =>
      expect(profileRepository.remove).toHaveBeenCalledWith(mockDatabase, 'profile-2'),
    );
    alert.mockRestore();
  });
});
