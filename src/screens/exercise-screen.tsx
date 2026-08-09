import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import React from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import Animated, { FadeIn, LinearTransition, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
import { EmptyState } from '@/components/empty-state';
import { SwipeActionRow } from '@/components/swipe-action-row';
import { useDataChange } from '@/data/data-change-context';
import { exerciseRepository } from '@/data/exercise-repository';
import { setRepository } from '@/data/set-repository';
import { useAppTheme } from '@/theme/use-app-theme';
import { readableContentMaxWidth, useResponsiveLayout } from '@/theme/use-responsive-layout';
import type { SessionExercise, WorkoutSet } from '@/types/workout';
import { warningFeedback } from '@/utils/feedback';
import { track } from '@/utils/telemetry';
import { formatWeight } from '@/utils/weight';
import { exerciseTypeLabel, formatDuration } from '@/utils/workout';

const setColumns = [
  { label: 'SET', flex: 0.62 },
  { label: 'REPS', flex: 0.85 },
  { label: 'KG', flex: 1.15 },
  { label: 'LB', flex: 1.15 },
  { label: 'TUT', flex: 0.9 },
] as const;

const cardioColumns = [
  { label: 'SET', flex: 0.7 },
  { label: 'METRIC', flex: 1.3 },
  { label: 'VALUE', flex: 1.6 },
] as const;

function SetGridHeader({ cardio }: { cardio: boolean }): React.ReactElement {
  const theme = useAppTheme();
  const { compact } = useResponsiveLayout();
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      style={{ flexDirection: 'row', paddingHorizontal: compact ? 8 : 14, paddingVertical: 9, gap: compact ? 2 : 4 }}
    >
      {(cardio ? cardioColumns : setColumns).map(({ label, flex }) => (
        <Text
          key={label}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.72}
          style={{ flex, minWidth: 0, color: theme.colors.textMuted, fontSize: 11, fontWeight: '800', textAlign: 'center' }}
        >
          {label}
        </Text>
      ))}
    </View>
  );
}

function SetRow({ workoutSet, onDelete, onEdit }: { workoutSet: WorkoutSet; onDelete: () => void; onEdit: () => void }) {
  const theme = useAppTheme();
  const { compact } = useResponsiveLayout();
  const summary = workoutSet.kind === 'duration'
    ? `Set ${workoutSet.position + 1}, duration ${formatDuration(workoutSet.durationSeconds)}`
    : workoutSet.kind === 'calories'
      ? `Set ${workoutSet.position + 1}, ${workoutSet.calories} calories`
      : `Set ${workoutSet.position + 1}, ${workoutSet.reps} repetitions, ${workoutSet.inputWeight === null ? 'no added weight' : `${formatWeight(workoutSet.weightKg ?? 0)} kilograms, ${formatWeight(workoutSet.weightLb ?? 0)} pounds`}, ${workoutSet.tutSeconds} seconds time under tension`;
  const cells: [string, number][] = workoutSet.kind === 'duration'
    ? [[String(workoutSet.position + 1), cardioColumns[0].flex], ['Duration', cardioColumns[1].flex], [formatDuration(workoutSet.durationSeconds), cardioColumns[2].flex]]
    : workoutSet.kind === 'calories'
      ? [[String(workoutSet.position + 1), cardioColumns[0].flex], ['Calories', cardioColumns[1].flex], [`${workoutSet.calories} kcal`, cardioColumns[2].flex]]
      : [
          [String(workoutSet.position + 1), setColumns[0].flex],
          [String(workoutSet.reps), setColumns[1].flex],
          [workoutSet.weightKg === null ? '—' : formatWeight(workoutSet.weightKg), setColumns[2].flex],
          [workoutSet.weightLb === null ? '—' : formatWeight(workoutSet.weightLb), setColumns[3].flex],
          [`${workoutSet.tutSeconds}s`, setColumns[4].flex],
        ];
  return (
    <SwipeActionRow onDelete={onDelete} deleteLabel={`Delete set ${workoutSet.position + 1}`}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={summary}
        accessibilityHint="Opens this set for editing."
        onPress={onEdit}
        style={({ pressed }) => ({
          minHeight: 58,
          flexDirection: 'row',
          alignItems: 'center',
          gap: compact ? 2 : 4,
          paddingHorizontal: compact ? 8 : 14,
          backgroundColor: theme.colors.surface,
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: 16,
          borderCurve: 'continuous',
          opacity: pressed ? 0.72 : 1,
        })}
      >
        {cells.map(([value, flex], index) => (
          <Text
            key={`${value}-${index}`}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.72}
            style={{ flex, minWidth: 0, textAlign: 'center', color: theme.colors.text, fontSize: compact ? 14 : 15, fontWeight: index === 0 ? '800' : '600', fontVariant: ['tabular-nums'] }}
          >
            {value}
          </Text>
        ))}
      </Pressable>
    </SwipeActionRow>
  );
}

export default function ExerciseScreen(): React.ReactElement {
  const { sessionId, exerciseId } = useLocalSearchParams<{ sessionId: string; exerciseId: string }>();
  const db = useSQLiteContext();
  const theme = useAppTheme();
  const { horizontalPadding } = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const { version, notifyDataChanged } = useDataChange();
  const [exercise, setExercise] = React.useState<SessionExercise | null>(null);
  const [sets, setSets] = React.useState<WorkoutSet[]>([]);
  const [refreshing, setRefreshing] = React.useState(false);

  const load = React.useCallback(async () => {
    const [nextExercise, nextSets] = await Promise.all([
      exerciseRepository.get(db, exerciseId),
      setRepository.listForExercise(db, exerciseId),
    ]);
    setExercise(nextExercise);
    setSets(nextSets);
  }, [db, exerciseId]);

  useFocusEffect(React.useCallback(() => {
    void version;
    void load();
  }, [load, version]));

  const refresh = async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  };

  const confirmDelete = (workoutSet: WorkoutSet) => {
    Alert.alert(`Delete set ${workoutSet.position + 1}?`, 'This entry will be permanently removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete Set',
        style: 'destructive',
        onPress: () => {
          const previous = sets;
          setSets((current) => current.filter((item) => item.id !== workoutSet.id).map((item, position) => ({ ...item, position })));
          void setRepository.remove(db, workoutSet.id, exerciseId).then(() => {
            warningFeedback();
            notifyDataChanged();
            track('set_deleted', { setId: workoutSet.id, exerciseId });
          }).catch((error) => {
            setSets(previous);
            track('database_error', { operation: 'set_delete', message: String(error) });
            Alert.alert('Set was not deleted', error instanceof Error ? error.message : 'Please try again.');
          });
        },
      },
    ]);
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
          gap: 8,
          flexGrow: sets.length ? undefined : 1,
        }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={theme.colors.accent} />}
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
        {sets.length ? <SetGridHeader cardio={exercise?.exerciseType === 'cardio'} /> : null}
        {sets.map((workoutSet) => (
          <Animated.View
            key={workoutSet.id}
            entering={reduceMotion ? undefined : FadeIn.duration(160)}
            layout={reduceMotion ? undefined : LinearTransition.duration(180)}
          >
            <SetRow
              workoutSet={workoutSet}
              onDelete={() => confirmDelete(workoutSet)}
              onEdit={() => router.push({
                pathname: '/sessions/[sessionId]/exercises/[exerciseId]/sets/[setId]',
                params: { sessionId, exerciseId, setId: workoutSet.id },
              })}
            />
          </Animated.View>
        ))}
        {!sets.length ? (
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <EmptyState title="No sets logged" message="Add your first set to start this exercise journal." />
          </View>
        ) : null}
      </ScrollView>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: Math.max(insets.bottom, 14), alignItems: 'center' }}>
        <View style={{ width: '100%', maxWidth: readableContentMaxWidth, paddingHorizontal: horizontalPadding }}>
          <AppButton
            label="Add Set"
            icon={{ name: 'plus' }}
            onPress={() => router.push({
              pathname: '/sessions/[sessionId]/exercises/[exerciseId]/sets/new',
              params: { sessionId, exerciseId },
            })}
            testID="add-set"
          />
        </View>
      </View>
    </View>
  );
}
