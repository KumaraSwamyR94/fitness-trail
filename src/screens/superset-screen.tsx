import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import React from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
import { AppIcon } from '@/components/app-icon';
import { EmptyState } from '@/components/empty-state';
import { FormField } from '@/components/form-field';
import { useDataChange } from '@/data/data-change-context';
import { useProfiles } from '@/data/profile-context';
import { supersetRepository } from '@/data/superset-repository';
import { useAppTheme } from '@/theme/use-app-theme';
import { readableContentMaxWidth, useResponsiveLayout } from '@/theme/use-responsive-layout';
import type { SupersetDetails, SupersetRoundEntry } from '@/types/workout';
import { successFeedback, warningFeedback } from '@/utils/feedback';
import { track } from '@/utils/telemetry';
import { exerciseTypeLabel, formatSetSummary } from '@/utils/workout';

function entrySummary(entry: SupersetRoundEntry): string {
  if (entry.status === 'pending') return 'Not logged';
  if (entry.status === 'skipped') return 'Skipped · Tap to fill';
  return entry.workoutSet ? formatSetSummary(entry.workoutSet) : 'Logged';
}

export default function SupersetScreen(): React.ReactElement {
  const { sessionId, supersetId } = useLocalSearchParams<{
    sessionId: string;
    supersetId: string;
  }>();
  const db = useSQLiteContext();
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { horizontalPadding } = useResponsiveLayout();
  const { version, notifyDataChanged } = useDataChange();
  const { selectedProfile, loading } = useProfiles();
  const [superset, setSuperset] = React.useState<SupersetDetails | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [renaming, setRenaming] = React.useState(false);
  const [name, setName] = React.useState('');

  const load = React.useCallback(async () => {
    if (!selectedProfile) {
      if (!loading) router.replace('/');
      return;
    }
    const next = await supersetRepository.getDetails(db, selectedProfile.id, supersetId);
    if (!next) {
      router.replace({ pathname: '/sessions/[sessionId]', params: { sessionId } });
      return;
    }
    setSuperset(next);
    setName(next.name);
  }, [db, loading, selectedProfile, sessionId, supersetId]);

  useFocusEffect(
    React.useCallback(() => {
      void version;
      void load();
    }, [load, version]),
  );

  const openEntry = (entry: SupersetRoundEntry) => {
    if (entry.status === 'completed' && entry.workoutSet) {
      router.push({
        pathname: '/sessions/[sessionId]/exercises/[exerciseId]/sets/[setId]',
        params: {
          sessionId,
          exerciseId: entry.exercise.id,
          setId: entry.workoutSet.id,
        },
      });
      return;
    }
    router.push({
      pathname: '/sessions/[sessionId]/supersets/[supersetId]/entries/[entryId]',
      params: { sessionId, supersetId, entryId: entry.id },
    });
  };

  const startOrResume = async () => {
    if (!selectedProfile || !superset) return;
    try {
      const pending = await supersetRepository.nextPendingEntry(db, selectedProfile.id, supersetId);
      const entryId =
        pending ?? (await supersetRepository.startRound(db, selectedProfile.id, supersetId));
      if (!pending) {
        notifyDataChanged();
        track('superset_round_started', { supersetId });
      }
      router.push({
        pathname: '/sessions/[sessionId]/supersets/[supersetId]/entries/[entryId]',
        params: { sessionId, supersetId, entryId },
      });
    } catch (caught) {
      Alert.alert(
        'Round could not start',
        caught instanceof Error ? caught.message : 'Please try again.',
      );
    }
  };

  const saveName = async () => {
    if (!selectedProfile) return;
    try {
      await supersetRepository.rename(db, selectedProfile.id, supersetId, name);
      setRenaming(false);
      notifyDataChanged();
      track('superset_updated', { supersetId });
      await load();
    } catch (caught) {
      Alert.alert(
        'Name was not saved',
        caught instanceof Error ? caught.message : 'Please try again.',
      );
    }
  };

  const dissolve = () =>
    Alert.alert(
      'Dissolve this superset?',
      'Exercises and sets will remain in the session as separate items.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Dissolve',
          onPress: () => {
            if (!selectedProfile) return;
            void supersetRepository.dissolve(db, selectedProfile.id, supersetId).then(() => {
              notifyDataChanged();
              track('superset_dissolved', { supersetId });
              successFeedback();
              router.replace({ pathname: '/sessions/[sessionId]', params: { sessionId } });
            });
          },
        },
      ],
    );

  const remove = () =>
    Alert.alert(
      'Delete this superset?',
      'All member exercises and their sets will be permanently removed. The reusable template is kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Superset',
          style: 'destructive',
          onPress: () => {
            if (!selectedProfile) return;
            void supersetRepository.remove(db, selectedProfile.id, supersetId).then(() => {
              notifyDataChanged();
              track('superset_deleted', { supersetId });
              warningFeedback();
              router.replace({ pathname: '/sessions/[sessionId]', params: { sessionId } });
            });
          },
        },
      ],
    );

  const openMenu = () =>
    Alert.alert('Superset options', superset?.name, [
      { text: 'Rename', onPress: () => setRenaming(true) },
      { text: 'Dissolve Superset', onPress: dissolve },
      { text: 'Delete Superset', style: 'destructive', onPress: remove },
      { text: 'Cancel', style: 'cancel' },
    ]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Stack.Screen
        options={{
          title: superset?.name ?? 'Superset',
          headerRight: () => (
            <Pressable accessibilityLabel="Superset options" onPress={openMenu} hitSlop={10}>
              <Text style={{ color: theme.colors.accent, fontSize: 24, fontWeight: '800' }}>
                •••
              </Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load().finally(() => setRefreshing(false));
            }}
            tintColor={theme.colors.accent}
          />
        }
        contentContainerStyle={{
          width: '100%',
          maxWidth: readableContentMaxWidth,
          alignSelf: 'center',
          paddingHorizontal: horizontalPadding,
          paddingTop: horizontalPadding,
          paddingBottom: 124,
          gap: 20,
        }}
      >
        {renaming ? (
          <View style={{ gap: 10 }}>
            <FormField
              label="Superset name"
              value={name}
              onChangeText={setName}
              onSubmitEditing={() => void saveName()}
              autoFocus
              maxLength={80}
            />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Pressable onPress={() => setRenaming(false)}>
                <Text style={{ color: theme.colors.textMuted, fontWeight: '800' }}>Cancel</Text>
              </Pressable>
              <Pressable onPress={() => void saveName()}>
                <Text style={{ color: theme.colors.accent, fontWeight: '800' }}>Save</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Text
              selectable
              style={{ flex: 1, color: theme.colors.text, fontSize: 20, fontWeight: '800' }}
            >
              Exercise order
            </Text>
            {superset && !superset.membershipLocked ? (
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/sessions/[sessionId]/supersets/[supersetId]/edit',
                    params: { sessionId, supersetId },
                  })
                }
              >
                <Text style={{ color: theme.colors.accent, fontWeight: '800' }}>Edit Members</Text>
              </Pressable>
            ) : null}
          </View>
          {superset?.members.map((member, index) => (
            <Pressable
              key={member.exercise.id}
              accessibilityRole="button"
              accessibilityLabel={`${index + 1}, ${member.exercise.displayName}`}
              accessibilityHint="Opens this exercise's set history."
              onPress={() =>
                router.push({
                  pathname: '/sessions/[sessionId]/exercises/[exerciseId]',
                  params: { sessionId, exerciseId: member.exercise.id },
                })
              }
              style={{
                minHeight: 58,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                padding: 14,
                borderRadius: 16,
                borderCurve: 'continuous',
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
              }}
            >
              <Text
                selectable
                style={{
                  color: theme.colors.accent,
                  fontWeight: '900',
                  fontVariant: ['tabular-nums'],
                }}
              >
                {index + 1}
              </Text>
              <View style={{ flex: 1, gap: 3 }}>
                <Text selectable style={{ color: theme.colors.text, fontWeight: '800' }}>
                  {member.exercise.displayName}
                </Text>
                <Text selectable style={{ color: theme.colors.textMuted, fontSize: 13 }}>
                  {[
                    exerciseTypeLabel(member.exercise.exerciseType),
                    member.exercise.muscleGroupName,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
              <AppIcon name="chevron-right" color={theme.colors.textMuted} />
            </Pressable>
          ))}
        </View>

        <View style={{ gap: 12 }}>
          <Text selectable style={{ color: theme.colors.text, fontSize: 20, fontWeight: '800' }}>
            Rounds
          </Text>
          {!superset?.rounds.length ? (
            <EmptyState
              title="No rounds yet"
              message="Start a round to log each exercise in sequence."
            />
          ) : (
            superset.rounds.map((round) => (
              <View
                key={round.id}
                style={{
                  padding: 14,
                  borderRadius: 18,
                  borderCurve: 'continuous',
                  borderWidth: 1,
                  borderColor:
                    round.status === 'in_progress' ? theme.colors.accent : theme.colors.border,
                  backgroundColor: theme.colors.surface,
                  gap: 10,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text selectable style={{ flex: 1, color: theme.colors.text, fontWeight: '900' }}>
                    Round {round.position + 1}
                  </Text>
                  <Text
                    selectable
                    style={{
                      color:
                        round.status === 'completed' ? theme.colors.success : theme.colors.accent,
                      fontWeight: '800',
                      fontSize: 13,
                    }}
                  >
                    {round.status === 'completed' ? 'Complete' : 'In progress'}
                  </Text>
                </View>
                {round.entries.map((entry) => (
                  <Pressable
                    key={entry.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${entry.exercise.displayName}, ${entrySummary(entry)}`}
                    onPress={() => openEntry(entry)}
                    style={{
                      minHeight: 48,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      paddingVertical: 8,
                      borderTopWidth: entry.position ? 1 : 0,
                      borderTopColor: theme.colors.border,
                    }}
                  >
                    <AppIcon
                      name={
                        entry.status === 'completed'
                          ? 'check-circle'
                          : entry.status === 'skipped'
                            ? 'skip-next-circle-outline'
                            : 'circle-outline'
                      }
                      color={
                        entry.status === 'completed'
                          ? theme.colors.success
                          : entry.status === 'skipped'
                            ? theme.colors.textMuted
                            : theme.colors.accent
                      }
                    />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text selectable style={{ color: theme.colors.text, fontWeight: '700' }}>
                        {entry.exercise.displayName}
                      </Text>
                      <Text selectable style={{ color: theme.colors.textMuted, fontSize: 13 }}>
                        {entrySummary(entry)}
                      </Text>
                    </View>
                    <AppIcon name="chevron-right" color={theme.colors.textMuted} />
                  </Pressable>
                ))}
              </View>
            ))
          )}
        </View>
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
            label={superset?.hasPendingEntries ? 'Resume Round' : 'Start Next Round'}
            icon={{ name: superset?.hasPendingEntries ? 'play' : 'plus' }}
            onPress={() => void startOrResume()}
            testID="start-superset-round"
          />
        </View>
      </View>
    </View>
  );
}
