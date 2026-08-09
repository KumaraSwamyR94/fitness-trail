import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ProfileForm } from '@/features/profiles/profile-form';

jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('@/utils/profile-media', () => ({
  cachedAvatarSnapshot: () => [],
  cacheMissingAvatars: async () => [],
  persistProfilePhoto: jest.fn(),
  removePrivateProfilePhoto: jest.fn(),
  profilePhotoUri: () => null,
}));

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

async function renderProfileForm(onSubmit = jest.fn(async () => undefined)) {
  return {
    onSubmit,
    ...await render(
      <SafeAreaProvider initialMetrics={initialMetrics}>
        <ProfileForm submitLabel="Save" submitting={false} onSubmit={onSubmit} />
      </SafeAreaProvider>,
    ),
  };
}

describe('profile form', () => {
  test('validates required adult profile fields', async () => {
    const { getByTestId, findByText, onSubmit } = await renderProfileForm();
    await fireEvent.press(getByTestId('save-profile'));
    expect(await findByText('Enter a name.')).toBeTruthy();
    expect(await findByText('Enter an age from 18 to 150.')).toBeTruthy();
    expect(await findByText('Choose a gender option.')).toBeTruthy();
    expect(await findByText('Enter a height greater than 0.')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('submits profile values while keeping the picture optional', async () => {
    const onSubmit = jest.fn(async () => undefined);
    const { getByTestId } = await renderProfileForm(onSubmit);
    await fireEvent.changeText(getByTestId('profile-name'), 'Alex Trail');
    await fireEvent.changeText(getByTestId('profile-age'), '30');
    await fireEvent.changeText(getByTestId('profile-height-cm'), '175');
    await fireEvent.press(getByTestId('profile-gender-non_binary'));
    await fireEvent.press(getByTestId('save-profile'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Alex Trail',
      ageSource: 'age',
      ageYears: 30,
      gender: 'non_binary',
      heightCm: 175,
      photo: { kind: 'none', ref: null },
    })));
  });
});
