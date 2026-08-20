import { render } from '@testing-library/react-native';
import React from 'react';

import { exerciseRepository } from '@/data/exercise-repository';
import { setRepository } from '@/data/set-repository';
import ExerciseScreen from '@/screens/exercise-screen';
import type { PreviousExerciseWorkout, SessionExercise, WorkoutSet } from '@/types/workout';

jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  return {
    router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
    Stack: { Screen: () => null },
    useFocusEffect: (callback: () => void) => React.useEffect(callback, [callback]),
    useLocalSearchParams: () => ({ sessionId: 'current-session', exerciseId: 'current-exercise' }),
  };
});

jest.mock('expo-sqlite', () => {
  const database = {};
  return { useSQLiteContext: () => database };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
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

jest.mock('@/components/swipe-action-row', () => ({
  SwipeActionRow: ({ children }: React.PropsWithChildren) => children,
}));

jest.mock('@/data/data-change-context', () => ({
  useDataChange: () => ({ version: 0, notifyDataChanged: jest.fn() }),
}));

jest.mock('@/data/profile-context', () => {
  const selectedProfile = { id: 'profile-1' };
  return { useProfiles: () => ({ selectedProfile, loading: false }) };
});

jest.mock('@/data/exercise-repository', () => ({
  exerciseRepository: { get: jest.fn() },
}));

jest.mock('@/data/set-repository', () => ({
  setRepository: {
    getPreviousWorkout: jest.fn(),
    listForExercise: jest.fn(),
    remove: jest.fn(),
  },
}));

const exercise: SessionExercise = {
  id: 'current-exercise',
  sessionId: 'current-session',
  catalogId: 'bench-press',
  displayName: 'Bench Press',
  normalizedName: 'bench press',
  muscleGroupId: 'chest',
  muscleGroupName: 'Chest',
  exerciseType: 'free_weight',
  position: 0,
  createdAt: 10,
  updatedAt: 10,
};

const currentSet: WorkoutSet = {
  id: 'current-set',
  exerciseId: 'current-exercise',
  position: 0,
  kind: 'strength',
  reps: 8,
  inputWeight: 55,
  inputUnit: 'kg',
  weightKg: 55,
  weightLb: 121.254,
  tutSeconds: 20,
  createdAt: 10,
  updatedAt: 10,
};

const previousWorkout: PreviousExerciseWorkout = {
  sessionId: 'previous-session',
  sessionName: 'Previous Monday',
  scheduledAt: new Date(2026, 7, 17, 18).getTime(),
  exerciseId: 'previous-exercise',
  exerciseName: 'Bench Press',
  exerciseType: 'free_weight',
  sets: [{ ...currentSet, id: 'previous-set', exerciseId: 'previous-exercise' }],
};

describe('ExerciseScreen workout history', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(exerciseRepository.get).mockResolvedValue(exercise);
  });

  test('keeps the existing empty state when no previous workout exists', async () => {
    jest.mocked(setRepository.listForExercise).mockResolvedValue([]);
    jest.mocked(setRepository.getPreviousWorkout).mockResolvedValue(null);

    const view = await render(<ExerciseScreen />);

    expect(await view.findByText('No sets logged')).toBeTruthy();
    expect(view.queryByText('Last workout')).toBeNull();
    expect(view.queryByText('This session')).toBeNull();
  });

  test('places read-only history below the interactive current-session grid', async () => {
    jest.mocked(setRepository.listForExercise).mockResolvedValue([currentSet]);
    jest.mocked(setRepository.getPreviousWorkout).mockResolvedValue(previousWorkout);

    const view = await render(<ExerciseScreen />);

    expect(await view.findByText('Last workout')).toBeTruthy();
    expect(view.getByText(/Previous Monday/)).toBeTruthy();
    expect(view.getByText('This session')).toBeTruthy();
    expect(view.getAllByTestId('historical-set-row')).toHaveLength(1);
    expect(view.getAllByTestId('current-set-row')).toHaveLength(1);
    const currentSection = view.getByTestId('current-session-section');
    const previousSection = view.getByTestId('previous-workout-section');
    expect(currentSection.parent).toBe(previousSection.parent);
    const siblings = currentSection.parent?.children ?? [];
    expect(siblings.indexOf(currentSection)).toBeLessThan(siblings.indexOf(previousSection));
  });
});
