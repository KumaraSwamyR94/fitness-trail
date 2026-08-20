import React from 'react';
import { Text, View } from 'react-native';

import { WorkoutSetGrid } from '@/components/workout-set-grid';
import { useAppTheme } from '@/theme/use-app-theme';
import type { PreviousExerciseWorkout } from '@/types/workout';

export function PreviousWorkoutSection({
  workout,
}: {
  workout: PreviousExerciseWorkout;
}): React.ReactElement {
  const theme = useAppTheme();
  const setCount = workout.sets.length;
  const scheduledLabel = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(workout.scheduledAt);

  return (
    <View
      style={{
        gap: 8,
        padding: 14,
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 18,
        borderCurve: 'continuous',
      }}
      testID="previous-workout-section"
    >
      <View style={{ gap: 4, paddingHorizontal: 2 }}>
        <Text selectable style={{ color: theme.colors.text, fontSize: 18, fontWeight: '800' }}>
          Last workout
        </Text>
        <Text selectable style={{ color: theme.colors.textMuted, fontSize: 14, lineHeight: 20 }}>
          {workout.sessionName} · {scheduledLabel} · {setCount} {setCount === 1 ? 'set' : 'sets'}
        </Text>
      </View>
      <WorkoutSetGrid sets={workout.sets} exerciseType={workout.exerciseType} readOnly />
    </View>
  );
}
