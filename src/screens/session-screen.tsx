import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import React from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import DraggableFlatList, { type RenderItemParams } from 'react-native-draggable-flatlist';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
import { AppIcon } from '@/components/app-icon';
import { EmptyState } from '@/components/empty-state';
import { SwipeActionRow } from '@/components/swipe-action-row';
import { useDataChange } from '@/data/data-change-context';
import { exerciseRepository } from '@/data/exercise-repository';
import { useProfiles } from '@/data/profile-context';
import { sessionRepository } from '@/data/session-repository';
import { supersetRepository } from '@/data/superset-repository';
import { useAppTheme } from '@/theme/use-app-theme';
import { readableContentMaxWidth, useResponsiveLayout } from '@/theme/use-responsive-layout';
import type { ExerciseSummary, Session, SessionWorkoutItem } from '@/types/workout';
import { selectionFeedback, warningFeedback } from '@/utils/feedback';
import { validateName } from '@/utils/names';
import { track } from '@/utils/telemetry';
import { exerciseTypeLabel, formatSetSummary } from '@/utils/workout';

export default function SessionScreen(): React.ReactElement {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const db = useSQLiteContext();
  const theme = useAppTheme();
  const { horizontalPadding } = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const { version, notifyDataChanged } = useDataChange();
  const { selectedProfile, loading: profilesLoading } = useProfiles();
  const [session, setSession] = React.useState<Session | null>(null);
  const [items, setItems] = React.useState<SessionWorkoutItem[]>([]);
  const [refreshing, setRefreshing] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editingName, setEditingName] = React.useState('');
  const [renameError, setRenameError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!selectedProfile) {
      if (!profilesLoading) router.replace('/');
      return;
    }
    const [nextSession, nextItems] = await Promise.all([
      sessionRepository.get(db, selectedProfile.id, sessionId),
      supersetRepository.listSessionItems(db, selectedProfile.id, sessionId),
    ]);
    if (!nextSession) {
      router.replace('/');
      return;
    }
    setSession(nextSession);
    setItems(nextItems);
  }, [db, profilesLoading, selectedProfile, sessionId]);

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

  const confirmDeleteSession = React.useCallback(() => {
    Alert.alert(
      'Delete this session?',
      'All exercises and sets inside it will be permanently removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Session',
          style: 'destructive',
          onPress: () => {
            if (!selectedProfile) return;
            void sessionRepository.remove(db, selectedProfile.id, sessionId).then(() => {
              warningFeedback();
              notifyDataChanged();
              track('session_deleted', { sessionId });
              router.replace('/');
            });
          },
        },
      ],
    );
  }, [db, notifyDataChanged, selectedProfile, sessionId]);

  const openMenu = React.useCallback(() => {
    Alert.alert('Session options', session?.name, [
      {
        text: 'Edit Session',
        onPress: () =>
          router.push({ pathname: '/sessions/[sessionId]/edit', params: { sessionId } }),
      },
      { text: 'Delete Session', style: 'destructive', onPress: confirmDeleteSession },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [confirmDeleteSession, session?.name, sessionId]);

  const confirmDeleteExercise = (exercise: ExerciseSummary) => {
    Alert.alert(
      `Delete ${exercise.displayName}?`,
      'All sets logged for this exercise will be permanently removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Exercise',
          style: 'destructive',
          onPress: () => {
            const previous = items;
            setItems((current) => current.filter((item) => item.id !== exercise.id));
            void exerciseRepository
              .remove(db, selectedProfile!.id, exercise.id, sessionId)
              .then(() => {
                warningFeedback();
                notifyDataChanged();
                track('exercise_deleted', { exerciseId: exercise.id });
              })
              .catch((error) => {
                setItems(previous);
                Alert.alert(
                  'Exercise was not deleted',
                  error instanceof Error ? error.message : 'Please try again.',
                );
              });
          },
        },
      ],
    );
  };

  const saveRename = async (exercise: ExerciseSummary) => {
    const validation = validateName(editingName);
    if (validation) {
      setRenameError(validation);
      return;
    }
    try {
      await exerciseRepository.rename(db, selectedProfile!.id, exercise.id, sessionId, editingName);
      setEditingId(null);
      setRenameError(null);
      notifyDataChanged();
      track('exercise_updated', { exerciseId: exercise.id });
      await load();
    } catch (error) {
      setRenameError(error instanceof Error ? error.message : 'Unable to rename exercise.');
    }
  };

  const confirmDeleteSuperset = (item: Extract<SessionWorkoutItem, { kind: 'superset' }>) => {
    Alert.alert(
      `Delete ${item.superset.name}?`,
      'All member exercises and their sets will be permanently removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Superset',
          style: 'destructive',
          onPress: () => {
            const previous = items;
            setItems((current) => current.filter((candidate) => candidate.id !== item.id));
            void supersetRepository
              .remove(db, selectedProfile!.id, item.id)
              .then(() => {
                warningFeedback();
                notifyDataChanged();
                track('superset_deleted', { supersetId: item.id });
              })
              .catch((error) => {
                setItems(previous);
                Alert.alert(
                  'Superset was not deleted',
                  error instanceof Error ? error.message : 'Please try again.',
                );
              });
          },
        },
      ],
    );
  };

  const renderExercise = ({ item, drag, isActive }: RenderItemParams<SessionWorkoutItem>) => {
    if (item.kind === 'superset') {
      const memberNames = item.superset.members
        .map((member) => member.exercise.displayName)
        .join(' → ');
      const roundSummary = item.superset.hasPendingEntries
        ? 'Round in progress'
        : `${item.superset.completedRoundCount} completed ${item.superset.completedRoundCount === 1 ? 'round' : 'rounds'}`;
      return (
        <SwipeActionRow
          onDelete={() => confirmDeleteSuperset(item)}
          deleteLabel={`Delete ${item.superset.name}`}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.superset.name}, ${memberNames}, ${roundSummary}`}
            accessibilityHint="Opens guided superset rounds."
            onPress={() =>
              router.push({
                pathname: '/sessions/[sessionId]/supersets/[supersetId]',
                params: { sessionId, supersetId: item.id },
              })
            }
            style={{
              backgroundColor: isActive ? theme.colors.accentSoft : theme.colors.surface,
              borderWidth: 1,
              borderColor: isActive ? theme.colors.accent : theme.colors.border,
              borderRadius: 18,
              borderCurve: 'continuous',
              padding: 15,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.colors.accentSoft,
              }}
            >
              <AppIcon name="link-variant" color={theme.colors.accent} size={22} />
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
              <Text
                selectable
                style={{ color: theme.colors.text, fontSize: 17, fontWeight: '800' }}
              >
                {item.superset.name}
              </Text>
              <Text selectable style={{ color: theme.colors.textMuted, fontSize: 14 }}>
                {memberNames}
              </Text>
              <Text
                selectable
                style={{
                  color: item.superset.hasPendingEntries
                    ? theme.colors.accent
                    : theme.colors.textMuted,
                  fontSize: 13,
                  fontWeight: '700',
                }}
              >
                {roundSummary}
              </Text>
            </View>
            <Pressable
              accessibilityLabel={`Reorder ${item.superset.name}`}
              accessibilityHint="Long press, then drag."
              onLongPress={drag}
              delayLongPress={120}
              hitSlop={10}
              style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
            >
              <AppIcon name="reorder-horizontal" color={theme.colors.textMuted} size={22} />
            </Pressable>
          </Pressable>
        </SwipeActionRow>
      );
    }
    const exercise = item.exercise;
    const setSummary = exercise.setCount
      ? `${exercise.setCount} ${exercise.setCount === 1 ? 'set' : 'sets'}${exercise.lastSet ? ` · Last: ${formatSetSummary(exercise.lastSet)}` : ''}`
      : 'No sets logged';
    const summary = [exerciseTypeLabel(exercise.exerciseType), exercise.muscleGroupName, setSummary]
      .filter(Boolean)
      .join(' · ');
    const editing = editingId === exercise.id;

    return (
      <SwipeActionRow
        onDelete={() => confirmDeleteExercise(exercise)}
        deleteLabel={`Delete ${exercise.displayName}`}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${exercise.displayName}, ${summary}`}
          accessibilityHint="Opens the set logger. Long press to rename."
          disabled={editing}
          onPress={() =>
            router.push({
              pathname: '/sessions/[sessionId]/exercises/[exerciseId]',
              params: { sessionId, exerciseId: exercise.id },
            })
          }
          onLongPress={() => {
            setEditingId(exercise.id);
            setEditingName(exercise.displayName);
            setRenameError(null);
          }}
          style={{
            backgroundColor: isActive ? theme.colors.accentSoft : theme.colors.surface,
            borderWidth: 1,
            borderColor: isActive ? theme.colors.accent : theme.colors.border,
            borderRadius: 18,
            borderCurve: 'continuous',
            padding: 15,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
            {editing ? (
              <>
                <TextInput
                  autoFocus
                  accessibilityLabel="Exercise name"
                  value={editingName}
                  onChangeText={setEditingName}
                  onSubmitEditing={() => void saveRename(exercise)}
                  returnKeyType="done"
                  maxLength={80}
                  style={{
                    minHeight: 44,
                    paddingHorizontal: 12,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: renameError ? theme.colors.danger : theme.colors.accent,
                    color: theme.colors.text,
                    backgroundColor: theme.colors.background,
                    fontSize: 16,
                    fontWeight: '700',
                  }}
                />
                {renameError ? (
                  <Text style={{ color: theme.colors.danger }}>{renameError}</Text>
                ) : null}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Pressable onPress={() => setEditingId(null)} hitSlop={8}>
                    <Text style={{ color: theme.colors.textMuted, fontWeight: '700' }}>Cancel</Text>
                  </Pressable>
                  <Pressable onPress={() => void saveRename(exercise)} hitSlop={8}>
                    <Text style={{ color: theme.colors.accent, fontWeight: '800' }}>Save</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <Text
                  selectable
                  style={{
                    color: theme.colors.text,
                    fontSize: 17,
                    fontWeight: '800',
                    flexShrink: 1,
                  }}
                >
                  {exercise.displayName}
                </Text>
                <Text
                  selectable
                  style={{ color: theme.colors.textMuted, fontSize: 14, flexShrink: 1 }}
                >
                  {summary}
                </Text>
              </>
            )}
          </View>
          {!editing ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Reorder ${exercise.displayName}`}
              accessibilityHint="Long press, then drag."
              onLongPress={drag}
              delayLongPress={120}
              hitSlop={10}
              style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
            >
              <AppIcon name="reorder-horizontal" color={theme.colors.textMuted} size={22} />
            </Pressable>
          ) : null}
        </Pressable>
      </SwipeActionRow>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Stack.Screen
        options={{
          title: session?.name ?? 'Session',
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Session options"
              onPress={openMenu}
              hitSlop={10}
            >
              <Text style={{ color: theme.colors.accent, fontSize: 24, fontWeight: '800' }}>
                •••
              </Text>
            </Pressable>
          ),
        }}
      />
      <DraggableFlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={renderExercise}
        onDragEnd={({ data }) => {
          const previous = items;
          setItems(data);
          void supersetRepository
            .reorderSessionItems(
              db,
              selectedProfile!.id,
              sessionId,
              data.map((item) => item.id),
            )
            .then(() => {
              selectionFeedback();
              notifyDataChanged();
            })
            .catch((error) => {
              setItems(previous);
              Alert.alert(
                'Order was not saved',
                error instanceof Error ? error.message : 'Please try again.',
              );
            });
        }}
        activationDistance={12}
        refreshing={refreshing}
        onRefresh={() => void refresh()}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          width: '100%',
          maxWidth: readableContentMaxWidth,
          alignSelf: 'center',
          paddingHorizontal: horizontalPadding,
          paddingTop: horizontalPadding,
          paddingBottom: 116,
          gap: 12,
          flexGrow: items.length ? undefined : 1,
        }}
        ListHeaderComponent={
          session ? (
            <View style={{ gap: 4, paddingBottom: 6 }}>
              <Text selectable style={{ color: theme.colors.textMuted, fontSize: 14 }}>
                {new Intl.DateTimeFormat(undefined, {
                  dateStyle: 'full',
                  timeStyle: 'short',
                }).format(session.scheduledAt)}
              </Text>
              <Text
                selectable
                style={{ color: theme.colors.text, fontSize: 22, fontWeight: '800' }}
              >
                Exercises
              </Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <EmptyState
              title="No exercises yet"
              message="Add an exercise or create a superset to start building this session."
            />
          </View>
        }
      />
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
            label="Add Exercise or Superset"
            icon={{ name: 'plus' }}
            onPress={() =>
              Alert.alert('Add to session', undefined, [
                {
                  text: 'Add Exercise',
                  onPress: () =>
                    router.push({
                      pathname: '/sessions/[sessionId]/exercises/new',
                      params: { sessionId },
                    }),
                },
                {
                  text: 'Create Superset',
                  onPress: () =>
                    router.push({
                      pathname: '/sessions/[sessionId]/supersets/new',
                      params: { sessionId },
                    }),
                },
                { text: 'Cancel', style: 'cancel' },
              ])
            }
            testID="add-exercise"
          />
        </View>
      </View>
    </View>
  );
}
