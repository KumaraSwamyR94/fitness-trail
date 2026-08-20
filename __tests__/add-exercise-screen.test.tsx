import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';

import { exerciseRepository } from '@/data/exercise-repository';
import { muscleGroupRepository } from '@/data/muscle-group-repository';
import AddExerciseScreen from '@/screens/add-exercise-screen';
import type { ExerciseCatalogEntry } from '@/types/workout';

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ sessionId: 'current-session' }),
}));

jest.mock('expo-sqlite', () => ({
  useSQLiteContext: () => ({}),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('@react-native-vector-icons/material-design-icons', () => ({
  MaterialDesignIcons: () => null,
}));

jest.mock('@/data/data-change-context', () => ({
  useDataChange: () => ({ notifyDataChanged: jest.fn() }),
}));

jest.mock('@/data/profile-context', () => ({
  useProfiles: () => ({ selectedProfile: { id: 'profile-1' }, loading: false }),
}));

jest.mock('@/data/exercise-repository', () => ({
  exerciseRepository: { create: jest.fn(), searchCatalog: jest.fn() },
}));

jest.mock('@/data/muscle-group-repository', () => ({
  muscleGroupRepository: { searchCatalog: jest.fn() },
}));

function catalogEntry(
  id: string,
  displayName: string,
  overrides: Partial<ExerciseCatalogEntry> = {},
): ExerciseCatalogEntry {
  return {
    id,
    normalizedName: displayName.toLowerCase(),
    displayName,
    muscleGroupId: 'chest',
    muscleGroupName: 'Chest',
    exerciseType: 'free_weight',
    useCount: 1,
    lastUsedAt: 1,
    ...overrides,
  };
}

describe('AddExerciseScreen exercise suggestions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(muscleGroupRepository.searchCatalog).mockResolvedValue([]);
  });

  test('hides suggestions until the user types an exercise name', async () => {
    jest
      .mocked(exerciseRepository.searchCatalog)
      .mockResolvedValue([catalogEntry('bench-press', 'Bench Press')]);

    const view = await render(<AddExerciseScreen />);

    expect(view.queryByTestId('inline-exercise-suggestions')).toBeNull();
    expect(view.queryByText('Recently used exercises')).toBeNull();
  });

  test('shows no-match feedback directly below the exercise field', async () => {
    jest.mocked(exerciseRepository.searchCatalog).mockResolvedValue([]);
    const view = await render(<AddExerciseScreen />);

    await fireEvent.changeText(view.getByTestId('exercise-name'), 'Unknown lift');

    expect(await view.findByText('No matching exercise yet.')).toBeTruthy();
    const inputContainer = view.getByTestId('exercise-name').parent;
    const suggestionSection = view.getByTestId('inline-exercise-suggestions');
    expect(inputContainer?.parent).toBe(suggestionSection.parent);
    const siblings = suggestionSection.parent?.children ?? [];
    expect(siblings.indexOf(inputContainer!)).toBeLessThan(siblings.indexOf(suggestionSection));
    expect(siblings.indexOf(suggestionSection)).toBeLessThan(
      siblings.indexOf(view.getByText('Exercise type').parent!),
    );
  });

  test('limits suggestions to five and puts an exact match first', async () => {
    const exactMatch = catalogEntry('bench-press', 'Bench Press');
    jest
      .mocked(exerciseRepository.searchCatalog)
      .mockResolvedValue([
        catalogEntry('bench-press-a', 'Bench Press A'),
        catalogEntry('bench-press-b', 'Bench Press B'),
        catalogEntry('bench-press-c', 'Bench Press C'),
        catalogEntry('bench-press-d', 'Bench Press D'),
        catalogEntry('bench-press-e', 'Bench Press E'),
        exactMatch,
      ]);
    const view = await render(<AddExerciseScreen />);

    await fireEvent.changeText(view.getByTestId('exercise-name'), 'Bench Press');
    await waitFor(() => expect(view.getAllByTestId(/^exercise-suggestion-/)).toHaveLength(5));

    const suggestionItems = view.getAllByTestId(/^exercise-suggestion-/);
    expect(suggestionItems[0]).toHaveProp('testID', 'exercise-suggestion-bench-press');
    expect(view.queryByTestId('exercise-suggestion-bench-press-e')).toBeNull();
  });

  test('selecting a focused-field suggestion fills its saved exercise details', async () => {
    const machinePress = catalogEntry('machine-press', 'Machine Press', {
      muscleGroupId: 'shoulders',
      muscleGroupName: 'Shoulders',
      exerciseType: 'machine',
    });
    jest.mocked(exerciseRepository.searchCatalog).mockResolvedValue([machinePress]);
    const view = await render(<AddExerciseScreen />);
    const exerciseName = view.getByTestId('exercise-name');

    await fireEvent(exerciseName, 'focus');
    await fireEvent.changeText(exerciseName, 'Machine');
    await waitFor(() => expect(view.getByTestId('exercise-suggestion-machine-press')).toBeTruthy());
    await fireEvent.press(view.getByTestId('exercise-suggestion-machine-press'));

    expect(view.getByTestId('exercise-name')).toHaveProp('value', 'Machine Press');
    expect(view.getByTestId('muscle-group')).toHaveProp('value', 'Shoulders');
    expect(view.getByTestId('exercise-type-machine')).toHaveProp('accessibilityState', {
      checked: true,
    });
  });
});
