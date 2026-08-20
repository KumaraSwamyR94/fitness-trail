import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import React from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';

import { useDataChange } from '@/data/data-change-context';
import { useProfiles } from '@/data/profile-context';
import { setRepository } from '@/data/set-repository';
import { supersetRepository } from '@/data/superset-repository';
import { SetForm } from '@/features/sets/set-form';
import { useAppTheme } from '@/theme/use-app-theme';
import type { SetInput, SupersetRoundEntry } from '@/types/workout';
import { successFeedback } from '@/utils/feedback';
import { track } from '@/utils/telemetry';

export default function SupersetEntryScreen(): React.ReactElement {
  const { sessionId, supersetId, entryId } = useLocalSearchParams<{
    sessionId: string;
    supersetId: string;
    entryId: string;
  }>();
  const db = useSQLiteContext();
  const theme = useAppTheme();
  const { notifyDataChanged } = useDataChange();
  const { selectedProfile, loading } = useProfiles();
  const [entry, setEntry] = React.useState<SupersetRoundEntry | null>(null);
  const [initialValue, setInitialValue] = React.useState<SetInput | undefined>();
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (loading) return;
    if (!selectedProfile) {
      router.replace('/');
      return;
    }
    void supersetRepository.getDetails(db, selectedProfile.id, supersetId).then(async (details) => {
      const found = details?.rounds
        .flatMap((round) => round.entries)
        .find((item) => item.id === entryId);
      if (!found || found.status === 'completed') {
        router.back();
        return;
      }
      setEntry(found);
      const sets = await setRepository.listForExercise(db, selectedProfile.id, found.exercise.id);
      const latest = sets.at(-1);
      if (latest?.kind === 'strength')
        setInitialValue({
          kind: 'strength',
          reps: latest.reps,
          inputWeight: latest.inputWeight,
          inputUnit: latest.inputUnit,
          tutSeconds: latest.tutSeconds,
        });
      else if (latest?.kind === 'duration')
        setInitialValue({ kind: 'duration', durationSeconds: latest.durationSeconds });
      else if (latest?.kind === 'calories')
        setInitialValue({ kind: 'calories', calories: latest.calories });
    });
  }, [db, entryId, loading, selectedProfile, supersetId]);

  const navigateNext = (nextEntryId: string | null) => {
    if (nextEntryId) {
      router.replace({
        pathname: '/sessions/[sessionId]/supersets/[supersetId]/entries/[entryId]',
        params: { sessionId, supersetId, entryId: nextEntryId },
      });
    } else {
      router.back();
    }
  };

  const save = async (input: SetInput) => {
    if (!selectedProfile || !entry) return;
    setSubmitting(true);
    try {
      const result = await setRepository.createForRoundEntry(
        db,
        selectedProfile.id,
        entry.id,
        input,
      );
      notifyDataChanged();
      track('superset_entry_completed', {
        supersetId,
        entryId: entry.id,
        setId: result.workoutSet.id,
      });
      successFeedback();
      navigateNext(result.nextEntryId);
    } catch (caught) {
      Alert.alert(
        'Set was not saved',
        caught instanceof Error ? caught.message : 'Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const skip = async () => {
    if (!selectedProfile || !entry) return;
    setSubmitting(true);
    try {
      const next = await supersetRepository.skipEntry(db, selectedProfile.id, entry.id);
      notifyDataChanged();
      track('superset_entry_skipped', { supersetId, entryId: entry.id });
      navigateNext(next);
    } catch (caught) {
      Alert.alert(
        'Exercise was not skipped',
        caught instanceof Error ? caught.message : 'Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!entry) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.background,
        }}
      >
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  return (
    <SetForm
      exerciseType={entry.exercise.exerciseType}
      initialValue={initialValue}
      heading={entry.exercise.displayName}
      description={
        entry.status === 'skipped'
          ? 'Fill the set skipped earlier.'
          : 'Log this exercise, then continue to the next member.'
      }
      submitLabel={entry.status === 'skipped' ? 'Fill Skipped Set' : 'Save & Continue'}
      submitting={submitting}
      onSubmit={save}
      secondaryAction={
        entry.status === 'pending'
          ? { label: 'Skip This Exercise', onPress: () => void skip() }
          : undefined
      }
    />
  );
}
