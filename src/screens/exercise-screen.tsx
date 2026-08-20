import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import React from 'react';
import { Alert, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
import { EmptyState } from '@/components/empty-state';
import { PreviousWorkoutSection } from '@/components/previous-workout-section';
import { WorkoutSetGrid } from '@/components/workout-set-grid';
import { useDataChange } from '@/data/data-change-context';
import { exerciseRepository } from '@/data/exercise-repository';
import { useProfiles } from '@/data/profile-context';
import { setRepository } from '@/data/set-repository';
import { supersetRepository } from '@/data/superset-repository';
import { useAppTheme } from '@/theme/use-app-theme';
import { readableContentMaxWidth, useResponsiveLayout } from '@/theme/use-responsive-layout';
import type { PreviousExerciseWorkout, SessionExercise, WorkoutSet } from '@/types/workout';
import { warningFeedback } from '@/utils/feedback';
import { track } from '@/utils/telemetry';
import { exerciseTypeLabel } from '@/utils/workout';

export default function ExerciseScreen(): React.ReactElement {
  const { sessionId, exerciseId } = useLocalSearchParams<{
    sessionId: string;
    exerciseId: string;
  }>();
  const db = useSQLiteContext();
  const theme = useAppTheme();
  const { horizontalPadding } = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const { version, notifyDataChanged } = useDataChange();
  const { selectedProfile, loading: profilesLoading } = useProfiles();
  const [exercise, setExercise] = React.useState<SessionExercise | null>(null);
  const [sets, setSets] = React.useState<WorkoutSet[]>([]);
  const [previousWorkout, setPreviousWorkout] = React.useState<PreviousExerciseWorkout | null>(
    null,
  );
  const [refreshing, setRefreshing] = React.useState(false);
  const [supersetId, setSupersetId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!selectedProfile) {
      if (!profilesLoading) router.replace('/');
      return;
    }
    const [nextExercise, nextSets, nextPreviousWorkout, group] = await Promise.all([
      exerciseRepository.get(db, selectedProfile.id, exerciseId),
      setRepository.listForExercise(db, selectedProfile.id, exerciseId),
      setRepository.getPreviousWorkout(db, selectedProfile.id, exerciseId),
      supersetRepository.findForExercise(db, selectedProfile.id, exerciseId),
    ]);
    if (!nextExercise) {
      router.replace('/');
      return;
    }
    setExercise(nextExercise);
    setSets(nextSets);
    setPreviousWorkout(nextPreviousWorkout);
    setSupersetId(group?.id ?? null);
  }, [db, exerciseId, profilesLoading, selectedProfile]);

  useFocusEffect(
    React.useCallback(() => {
      void version;
      void load();
    }, [load, version]),
  );

  const refresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  const confirmDelete = (workoutSet: WorkoutSet) => {
    Alert.alert(
      `Delete set ${workoutSet.position + 1}?`,
      'This entry will be permanently removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Set',
          style: 'destructive',
          onPress: () => {
            const previous = sets;
            setSets((current) =>
              current
                .filter((item) => item.id !== workoutSet.id)
                .map((item, position) => ({ ...item, position })),
            );
            if (!selectedProfile) return;
            void setRepository
              .remove(db, selectedProfile.id, workoutSet.id, exerciseId)
              .then(() => {
                warningFeedback();
                notifyDataChanged();
                track('set_deleted', { setId: workoutSet.id, exerciseId });
              })
              .catch((error) => {
                setSets(previous);
                track('database_error', { operation: 'set_delete', message: String(error) });
                Alert.alert(
                  'Set was not deleted',
                  error instanceof Error ? error.message : 'Please try again.',
                );
              });
          },
        },
      ],
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Stack.Screen options={{ title: exercise?.displayName ?? 'Exercise' }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          width: '100%',
          maxWidth: readableContentMaxWidth,
          alignSelf: 'center',
          paddingHorizontal: horizontalPadding,
          paddingTop: horizontalPadding,
          paddingBottom: 116,
          gap: 18,
          flexGrow: sets.length || previousWorkout ? undefined : 1,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            tintColor={theme.colors.accent}
          />
        }
      >
        <View style={{ gap: 4, paddingBottom: 6 }}>
          <Text selectable style={{ color: theme.colors.textMuted, fontSize: 14 }}>
            {exercise ? `${exerciseTypeLabel(exercise.exerciseType)} · ` : ''}
            {exercise?.muscleGroupName ? `${exercise.muscleGroupName} · ` : ''}
            {sets.length} {sets.length === 1 ? 'working set' : 'working sets'}
          </Text>
          <Text selectable style={{ color: theme.colors.text, fontSize: 22, fontWeight: '800' }}>
            Training log
          </Text>
        </View>
        <View
          style={{ flex: sets.length || previousWorkout ? undefined : 1, gap: 8 }}
          testID="current-session-section"
        >
          {previousWorkout ? (
            <Text selectable style={{ color: theme.colors.text, fontSize: 18, fontWeight: '800' }}>
              This session
            </Text>
          ) : null}
          {exercise ? (
            <WorkoutSetGrid
              sets={sets}
              exerciseType={exercise.exerciseType}
              onDelete={confirmDelete}
              onEdit={(workoutSet) =>
                router.push({
                  pathname: '/sessions/[sessionId]/exercises/[exerciseId]/sets/[setId]',
                  params: { sessionId, exerciseId, setId: workoutSet.id },
                })
              }
            />
          ) : null}
          {!sets.length ? (
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <EmptyState
                title="No sets logged"
                message="Add your first set to start this exercise journal."
              />
            </View>
          ) : null}
        </View>
        {previousWorkout ? <PreviousWorkoutSection workout={previousWorkout} /> : null}
      </ScrollView>
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: Math.max(insets.bottom, 14),
          alignItems: 'center',
        }}
      >
        <View
          style={{
            width: '100%',
            maxWidth: readableContentMaxWidth,
            paddingHorizontal: horizontalPadding,
          }}
        >
          <AppButton
            label={supersetId ? 'Open Superset' : 'Add Set'}
            icon={{ name: supersetId ? 'link-variant' : 'plus' }}
            onPress={() =>
              supersetId
                ? router.push({
                    pathname: '/sessions/[sessionId]/supersets/[supersetId]',
                    params: { sessionId, supersetId },
                  })
                : router.push({
                    pathname: '/sessions/[sessionId]/exercises/[exerciseId]/sets/new',
                    params: { sessionId, exerciseId },
                  })
            }
            testID="add-set"
          />
        </View>
      </View>
    </View>
  );
}
