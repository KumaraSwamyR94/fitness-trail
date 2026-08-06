import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import React from 'react';
import { Alert } from 'react-native';

import { useDataChange } from '@/data/data-change-context';
import { setRepository } from '@/data/set-repository';
import { SetForm } from '@/features/sets/set-form';
import type { SetInput } from '@/types/workout';
import { successFeedback } from '@/utils/feedback';
import { track } from '@/utils/telemetry';

export default function NewSetScreen(): React.ReactElement {
  const { exerciseId } = useLocalSearchParams<{ sessionId: string; exerciseId: string }>();
  const db = useSQLiteContext();
  const { notifyDataChanged } = useDataChange();
  const [initialValue, setInitialValue] = React.useState<SetInput | undefined>();
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    void setRepository.listForExercise(db, exerciseId).then((sets) => {
      const latest = sets.at(-1);
      if (latest) {
        setInitialValue({
          reps: latest.reps,
          inputWeight: latest.inputWeight,
          inputUnit: latest.inputUnit,
          tutSeconds: latest.tutSeconds,
        });
      }
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

  return <SetForm initialValue={initialValue} submitLabel="Add Set" submitting={submitting} onSubmit={save} />;
}
