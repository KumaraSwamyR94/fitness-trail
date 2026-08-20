import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { PreviousWorkoutSection } from '@/components/previous-workout-section';
import { WorkoutSetGrid } from '@/components/workout-set-grid';
import type { PreviousExerciseWorkout, WorkoutSet } from '@/types/workout';

jest.mock('@/components/swipe-action-row', () => ({
  SwipeActionRow: ({ children }: React.PropsWithChildren) => children,
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

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const strengthSets: WorkoutSet[] = [
  {
    id: 'set-1',
    exerciseId: 'previous-exercise',
    position: 0,
    kind: 'strength',
    reps: 8,
    inputWeight: 50,
    inputUnit: 'kg',
    weightKg: 50,
    weightLb: 110.231,
    tutSeconds: 20,
    createdAt: 1,
    updatedAt: 1,
  },
  {
    id: 'set-2',
    exerciseId: 'previous-exercise',
    position: 1,
    kind: 'strength',
    reps: 10,
    inputWeight: 45,
    inputUnit: 'kg',
    weightKg: 45,
    weightLb: 99.2079,
    tutSeconds: 18,
    createdAt: 2,
    updatedAt: 2,
  },
];

const previousWorkout: PreviousExerciseWorkout = {
  sessionId: 'previous-session',
  sessionName: 'Monday Strength',
  scheduledAt: new Date(2026, 7, 17, 18, 30).getTime(),
  exerciseId: 'previous-exercise',
  exerciseName: 'Bench Press',
  exerciseType: 'free_weight',
  sets: strengthSets,
};

function withSafeArea(children: React.ReactElement): React.ReactElement {
  return <SafeAreaProvider initialMetrics={initialMetrics}>{children}</SafeAreaProvider>;
}

describe('previous workout presentation', () => {
  test('shows session metadata and every previous set as static rows', async () => {
    const view = await render(withSafeArea(<PreviousWorkoutSection workout={previousWorkout} />));

    expect(view.getByText('Last workout')).toBeTruthy();
    expect(view.getByText(/Monday Strength/)).toBeTruthy();
    expect(view.getByText(/2 sets/)).toBeTruthy();
    expect(view.getAllByTestId('historical-set-row')).toHaveLength(2);
    expect(view.queryByTestId('current-set-row')).toBeNull();
    expect(view.getByTestId('previous-workout-section').props.style).toEqual(
      expect.objectContaining({ borderWidth: 1, borderRadius: 18 }),
    );
    for (const row of view.getAllByTestId('historical-set-row')) {
      expect(row.props.style).toEqual(expect.objectContaining({ borderWidth: 0, borderRadius: 0 }));
    }
    expect(
      view.getByLabelText(
        'Set 1, 8 repetitions, 50.00 kilograms, 110.23 pounds, 20 seconds time under tension',
      ),
    ).toBeTruthy();
  });

  test('keeps current-session rows interactive', async () => {
    const onEdit = jest.fn();
    const onDelete = jest.fn();
    const view = await render(
      withSafeArea(
        <WorkoutSetGrid
          sets={strengthSets}
          exerciseType="free_weight"
          onEdit={onEdit}
          onDelete={onDelete}
        />,
      ),
    );

    await fireEvent.press(view.getAllByTestId('current-set-row')[0]);
    expect(onEdit).toHaveBeenCalledWith(strengthSets[0]);
    expect(view.queryByTestId('historical-set-row')).toBeNull();
  });

  test('renders cardio history with duration and calorie columns', async () => {
    const cardioWorkout: PreviousExerciseWorkout = {
      ...previousWorkout,
      exerciseType: 'cardio',
      sets: [
        {
          id: 'duration',
          exerciseId: 'run',
          position: 0,
          kind: 'duration',
          durationSeconds: 605,
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: 'calories',
          exerciseId: 'run',
          position: 1,
          kind: 'calories',
          calories: 120,
          createdAt: 2,
          updatedAt: 2,
        },
      ],
    };
    const view = await render(withSafeArea(<PreviousWorkoutSection workout={cardioWorkout} />));

    expect(view.getByText('10:05')).toBeTruthy();
    expect(view.getByText('120 kcal')).toBeTruthy();
    expect(view.getAllByTestId('historical-set-row')).toHaveLength(2);
  });
});
