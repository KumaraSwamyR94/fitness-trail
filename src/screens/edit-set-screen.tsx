import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import React from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';

import { useDataChange } from '@/data/data-change-context';
import { setRepository } from '@/data/set-repository';
import { SetForm } from '@/features/sets/set-form';
import { useAppTheme } from '@/theme/use-app-theme';
import type { SetInput } from '@/types/workout';
import { successFeedback } from '@/utils/feedback';
import { track } from '@/utils/telemetry';

export default function EditSetScreen(): React.ReactElement {
  const { setId } = useLocalSearchParams<{ sessionId: string; exerciseId: string; setId: string }>();
  const db = useSQLiteContext();
  const theme = useAppTheme();
  const { notifyDataChanged } = useDataChange();
  const [initialValue, setInitialValue] = React.useState<SetInput | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    void setRepository.get(db, setId).then((workoutSet) => {
      if (!workoutSet) {
        Alert.alert('Set not found', 'It may have already been deleted.', [{ text: 'Close', onPress: () => router.back() }]);
        return;
      }
      setInitialValue({
        reps: workoutSet.reps,
        inputWeight: workoutSet.inputWeight,
        inputUnit: workoutSet.inputUnit,
        tutSeconds: workoutSet.tutSeconds,
      });
    });
  }, [db, setId]);

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

  if (!initialValue) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background }}><ActivityIndicator color={theme.colors.accent} /></View>;
  }

  return <SetForm initialValue={initialValue} submitLabel="Save Changes" submitting={submitting} onSubmit={save} />;
}
