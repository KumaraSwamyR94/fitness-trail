import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import React from 'react';

import { profileRepository } from '@/data/profile-repository';
import ProfilesScreen from '@/screens/profiles-screen';
import type { Profile, ProfileOverview } from '@/types/profile';

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
jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: { View },
    FadeIn: { duration: jest.fn() },
    LinearTransition: { duration: jest.fn() },
    useReducedMotion: () => true,
  };
});
jest.mock('@/components/profile-avatar', () => ({ ProfileAvatar: () => null }));

jest.mock('@/data/data-change-context', () => ({
  useDataChange: () => ({ version: 0 }),
}));

const mockRefreshProfiles = jest.fn(async () => undefined);
let mockProfiles: Profile[] = [];
let mockSelectedProfile: Profile | null = null;
jest.mock('@/data/profile-context', () => ({
  useProfiles: () => ({
    profiles: mockProfiles,
    selectedProfile: mockSelectedProfile,
    loading: false,
    refreshProfiles: mockRefreshProfiles,
  }),
}));

jest.mock('@/data/profile-repository', () => ({
  profileRepository: { getOverview: jest.fn() },
}));

const profile: Profile = {
  id: 'profile-1',
  name: 'Alex',
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

const overview: ProfileOverview = {
  ...profile,
  sessionCount: 2,
  exerciseCount: 3,
  setCount: 4,
  bmiMeasurementCount: 1,
  latestBmi: 22.9,
  latestWeight: 70,
  latestWeightUnit: 'kg',
};

const secondProfile: Profile = {
  ...profile,
  id: 'profile-2',
  name: 'Sam',
};

describe('ProfilesScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProfiles = [profile];
    mockSelectedProfile = profile;
    jest.mocked(profileRepository.getOverview).mockResolvedValue(overview);
  });

  test('shows the selected profile details without an inline profile list', async () => {
    const view = await render(<ProfilesScreen />);

    await waitFor(() => expect(view.getByText('Alex')).toBeTruthy());
    expect(view.getByText('Workout trail')).toBeTruthy();
    expect(view.getByText('BMI trail')).toBeTruthy();
    expect(view.getByText('SESSIONS')).toBeTruthy();
    expect(view.getByText('MEASUREMENTS')).toBeTruthy();
    expect(view.queryByTestId('add-profile')).toBeNull();
    expect(view.queryByTestId('open-profile-selector')).toBeNull();
    expect(view.queryByTestId('select-profile-profile-1')).toBeNull();
  });

  test('shows the profile selector only when multiple profiles exist', async () => {
    mockProfiles = [profile, secondProfile];
    const view = await render(<ProfilesScreen />);
    await waitFor(() => expect(view.getByText('Alex')).toBeTruthy());

    await fireEvent.press(view.getByTestId('open-profile-selector'));
    expect(router.push).toHaveBeenCalledWith('/profiles/select');
  });

  test('shows Import and Export as the final navigation card without a repeated button', async () => {
    const view = await render(<ProfilesScreen />);
    await waitFor(() => expect(view.getByText('Alex')).toBeTruthy());

    expect(view.getByText('Import & Export')).toBeTruthy();
    expect(view.queryByText('Open Data & Sync')).toBeNull();
    await fireEvent.press(view.getByTestId('open-import-export'));
    expect(router.push).toHaveBeenCalledWith('/profiles/data-sync');
  });

  test('shows Create Profile and hides Select Profile when there are no profiles', async () => {
    mockProfiles = [];
    mockSelectedProfile = null;

    const view = await render(<ProfilesScreen />);

    await waitFor(() => expect(view.getByText('No profiles yet')).toBeTruthy());
    expect(
      view.getByText('Create a profile to keep workout and BMI history separate.'),
    ).toBeTruthy();
    expect(view.queryByTestId('open-profile-selector')).toBeNull();

    await fireEvent.press(view.getByTestId('add-profile'));
    expect(router.push).toHaveBeenCalledWith('/profiles/new');
  });
});
