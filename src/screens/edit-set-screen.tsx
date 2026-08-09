import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import React from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';

import { useDataChange } from '@/data/data-change-context';
import { exerciseRepository } from '@/data/exercise-repository';
import { setRepository } from '@/data/set-repository';
import { SetForm } from '@/features/sets/set-form';
import { useAppTheme } from '@/theme/use-app-theme';
import type { ExerciseType, SetInput } from '@/types/workout';
import { successFeedback } from '@/utils/feedback';
import { track } from '@/utils/telemetry';

export default function EditSetScreen(): React.ReactElement {
  const { exerciseId, setId } = useLocalSearchParams<{ sessionId: string; exerciseId: string; setId: string }>();
  const db = useSQLiteContext();
  const theme = useAppTheme();
  const { notifyDataChanged } = useDataChange();
  const [initialValue, setInitialValue] = React.useState<SetInput | null>(null);
  const [exerciseType, setExerciseType] = React.useState<ExerciseType | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    void Promise.all([setRepository.get(db, setId), exerciseRepository.get(db, exerciseId)]).then(([workoutSet, exercise]) => {
      if (!workoutSet) {
        Alert.alert('Set not found', 'It may have already been deleted.', [{ text: 'Close', onPress: () => router.back() }]);
        return;
      }
      setExerciseType(exercise?.exerciseType ?? null);
      if (workoutSet.kind === 'strength') setInitialValue({ kind: 'strength', reps: workoutSet.reps, inputWeight: workoutSet.inputWeight, inputUnit: workoutSet.inputUnit, tutSeconds: workoutSet.tutSeconds });
      else if (workoutSet.kind === 'duration') setInitialValue({ kind: 'duration', durationSeconds: workoutSet.durationSeconds });
      else setInitialValue({ kind: 'calories', calories: workoutSet.calories });
    });
  }, [db, exerciseId, setId]);

  const save = async (input: SetInput) => {
    setSubmitting(true);
    try {
      await setRepository.update(db, setId, input);
      notifyDataChanged();
      track('set_updated', { setId });
      successFeedback();
      router.back();
    } catch (error) {
      track('database_error', { operation: 'set_update', message: String(error) });
      Alert.alert('Set was not updated', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!initialValue || !exerciseType) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background }}><ActivityIndicator color={theme.colors.accent} /></View>;
  }

  return <SetForm exerciseType={exerciseType} initialValue={initialValue} submitLabel="Save Changes" submitting={submitting} onSubmit={save} />;
}
