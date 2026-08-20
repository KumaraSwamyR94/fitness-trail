import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';

import { exerciseRepository } from '@/data/exercise-repository';
import { muscleGroupRepository } from '@/data/muscle-group-repository';
import { supersetRepository } from '@/data/superset-repository';
import CreateSupersetScreen from '@/screens/create-superset-screen';
import type { ExerciseSummary, SupersetTemplate } from '@/types/workout';

jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  return {
    router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
    Stack: { Screen: () => null },
    useFocusEffect: (callback: () => void) => React.useEffect(callback, [callback]),
    useLocalSearchParams: () => ({ sessionId: 'session-1' }),
  };
});

const mockDatabase = {};
jest.mock('expo-sqlite', () => ({ useSQLiteContext: () => mockDatabase }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@react-native-vector-icons/material-design-icons', () => ({
  MaterialDesignIcons: () => null,
}));
jest.mock('@/data/data-change-context', () => ({
  useDataChange: () => ({ notifyDataChanged: jest.fn() }),
}));
const mockSelectedProfile = { id: 'profile-1' };
jest.mock('@/data/profile-context', () => ({
  useProfiles: () => ({ selectedProfile: mockSelectedProfile, loading: false }),
}));
jest.mock('@/data/exercise-repository', () => ({
  exerciseRepository: { searchCatalog: jest.fn() },
}));
jest.mock('@/data/muscle-group-repository', () => ({
  muscleGroupRepository: { searchCatalog: jest.fn() },
}));
jest.mock('@/data/superset-repository', () => ({
  supersetRepository: {
    create: jest.fn(),
    getDetails: jest.fn(),
    listTemplates: jest.fn(),
    listUngroupedForSession: jest.fn(),
    removeTemplate: jest.fn(),
    renameTemplate: jest.fn(),
    updateMembers: jest.fn(),
  },
}));

function exercise(id: string, displayName: string): ExerciseSummary {
  return {
    id,
    sessionId: 'session-1',
    catalogId: `catalog-${id}`,
    displayName,
    normalizedName: displayName.toLowerCase(),
    muscleGroupId: 'muscle-chest',
    muscleGroupName: 'Chest',
    exerciseType: 'free_weight',
    position: Number(id.slice(-1)),
    setCount: 0,
    lastSet: null,
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('CreateSupersetScreen', () => {
  const available = [
    exercise('e1', 'Bench Press'),
    exercise('e2', 'Row'),
    exercise('e3', 'Push Up'),
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(supersetRepository.listUngroupedForSession).mockResolvedValue(available);
    jest.mocked(supersetRepository.listTemplates).mockResolvedValue([]);
    jest.mocked(exerciseRepository.searchCatalog).mockResolvedValue([]);
    jest.mocked(muscleGroupRepository.searchCatalog).mockResolvedValue([
      {
        id: 'muscle-chest',
        normalizedName: 'chest',
        displayName: 'Chest',
        isPredefined: true,
        useCount: 0,
        lastUsedAt: 0,
      },
      {
        id: 'muscle-back',
        normalizedName: 'back',
        displayName: 'Back',
        isPredefined: true,
        useCount: 0,
        lastUsedAt: 0,
      },
    ]);
    jest.mocked(supersetRepository.create).mockResolvedValue('superset-1');
  });

  test('selects and creates a three-exercise superset in order', async () => {
    const view = await render(<CreateSupersetScreen />);
    for (const item of available)
      await fireEvent.press(await view.findByLabelText(item.displayName));
    expect(view.getByText('Selected exercises (3)')).toBeTruthy();
    await fireEvent.press(view.getByTestId('create-superset'));
    await waitFor(() =>
      expect(supersetRepository.create).toHaveBeenCalledWith(
        expect.anything(),
        'profile-1',
        'session-1',
        expect.objectContaining({
          members: expect.arrayContaining([
            expect.objectContaining({ existingExerciseId: 'e1' }),
            expect.objectContaining({ existingExerciseId: 'e2' }),
            expect.objectContaining({ existingExerciseId: 'e3' }),
          ]),
        }),
      ),
    );
  });

  test('applies a reusable template as an independent snapshot by default', async () => {
    const template: SupersetTemplate = {
      id: 'template-1',
      profileId: 'profile-1',
      name: 'Push Pull',
      members: available.slice(0, 2).map((item, position) => ({
        id: `tm-${position}`,
        templateId: 'template-1',
        catalogId: item.catalogId,
        displayName: item.displayName,
        normalizedName: item.normalizedName,
        muscleGroupId: item.muscleGroupId,
        muscleGroupName: item.muscleGroupName,
        exerciseType: item.exerciseType,
        position,
      })),
      createdAt: 1,
      updatedAt: 1,
    };
    jest.mocked(supersetRepository.listTemplates).mockResolvedValue([template]);
    const view = await render(<CreateSupersetScreen />);
    await fireEvent.press(await view.findByText('Use'));
    expect(view.getByTestId('superset-name')).toHaveProp('value', 'Push Pull');
    expect(view.getByText('Selected exercises (2)')).toBeTruthy();
    await fireEvent.press(view.getByTestId('create-superset'));
    await waitFor(() =>
      expect(supersetRepository.create).toHaveBeenCalledWith(
        expect.anything(),
        'profile-1',
        'session-1',
        expect.objectContaining({
          templateId: 'template-1',
          saveAsTemplate: false,
        }),
      ),
    );
  });

  test('shows and selects reusable muscle-group suggestions for a new member', async () => {
    const view = await render(<CreateSupersetScreen />);

    expect(await view.findByText('Major muscle groups')).toBeTruthy();
    await fireEvent.press(await view.findByLabelText('Select Chest'));

    expect(view.getByTestId('superset-muscle-group')).toHaveProp('value', 'Chest');
    await waitFor(() =>
      expect(muscleGroupRepository.searchCatalog).toHaveBeenLastCalledWith(
        expect.anything(),
        'Chest',
      ),
    );
  });
});
