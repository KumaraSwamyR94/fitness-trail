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

export default function NewSetScreen(): React.ReactElement {
  const { exerciseId } = useLocalSearchParams<{ sessionId: string; exerciseId: string }>();
  const db = useSQLiteContext();
  const theme = useAppTheme();
  const { notifyDataChanged } = useDataChange();
  const [initialValue, setInitialValue] = React.useState<SetInput | undefined>();
  const [exerciseType, setExerciseType] = React.useState<ExerciseType | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    void Promise.all([
      exerciseRepository.get(db, exerciseId),
      setRepository.listForExercise(db, exerciseId),
    ]).then(([exercise, sets]) => {
      setExerciseType(exercise?.exerciseType ?? null);
      const latest = sets.at(-1);
      if (!latest) return;
      if (latest.kind === 'strength') setInitialValue({ kind: 'strength', reps: latest.reps, inputWeight: latest.inputWeight, inputUnit: latest.inputUnit, tutSeconds: latest.tutSeconds });
      else if (latest.kind === 'duration') setInitialValue({ kind: 'duration', durationSeconds: latest.durationSeconds });
      else setInitialValue({ kind: 'calories', calories: latest.calories });
    });
  }, [db, exerciseId]);

  const save = async (input: SetInput) => {
    setSubmitting(true);
    try {
      const created = await setRepository.create(db, exerciseId, input);
      notifyDataChanged();
      track('set_created', { setId: created.id, exerciseId });
      successFeedback();
      router.back();
    } catch (error) {
      track('database_error', { operation: 'set_create', message: String(error) });
      Alert.alert('Set was not saved', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!exerciseType) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background }}><ActivityIndicator color={theme.colors.accent} /></View>;
  }
  return <SetForm exerciseType={exerciseType} initialValue={initialValue} submitLabel="Add Set" submitting={submitting} onSubmit={save} />;
}
