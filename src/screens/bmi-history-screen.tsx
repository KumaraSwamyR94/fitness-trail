import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import React from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, Text, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { BmiMeasurementRow } from '@/components/bmi-measurement-row';
import { EmptyState } from '@/components/empty-state';
import { SelectedProfileCard } from '@/components/selected-profile-card';
import { type BmiMeasurementCursor, bmiRepository } from '@/data/bmi-repository';
import { useDataChange } from '@/data/data-change-context';
import { useProfiles } from '@/data/profile-context';
import { useAppTheme } from '@/theme/use-app-theme';
import { readableContentMaxWidth, useResponsiveLayout } from '@/theme/use-responsive-layout';
import type { BmiMeasurement } from '@/types/bmi';
import { successFeedback } from '@/utils/feedback';
import { track } from '@/utils/telemetry';

const BMI_HISTORY_PAGE_SIZE = 20;

export default function BmiHistoryScreen(): React.ReactElement {
  const db = useSQLiteContext();
  const theme = useAppTheme();
  const { horizontalPadding } = useResponsiveLayout();
  const { version, notifyDataChanged } = useDataChange();
  const { selectedProfile, loading: profilesLoading } = useProfiles();
  const [measurements, setMeasurements] = React.useState<BmiMeasurement[]>([]);
  const [nextCursor, setNextCursor] = React.useState<BmiMeasurementCursor | null>(null);
  const [initialLoading, setInitialLoading] = React.useState(true);
  const [initialError, setInitialError] = React.useState<string | null>(null);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [loadMoreError, setLoadMoreError] = React.useState<string | null>(null);
  const requestGeneration = React.useRef(0);
  const loadingMoreRef = React.useRef(false);
  const skipReloadVersion = React.useRef<number | null>(null);

  const reload = React.useCallback(async () => {
    const generation = ++requestGeneration.current;
    loadingMoreRef.current = false;
    setMeasurements([]);
    setNextCursor(null);
    setInitialError(null);
    setLoadMoreError(null);
    setLoadingMore(false);
    setInitialLoading(true);

    if (profilesLoading) return;
    if (!selectedProfile) {
      setInitialLoading(false);
      router.replace('/bmi');
      return;
    }

    try {
      const page = await bmiRepository.listPage(db, selectedProfile.id, BMI_HISTORY_PAGE_SIZE);
      if (requestGeneration.current !== generation) return;
      setMeasurements(page.measurements);
      setNextCursor(page.nextCursor);
    } catch (error) {
      if (requestGeneration.current !== generation) return;
      const message = error instanceof Error ? error.message : 'Please try again.';
      setInitialError(message);
      track('database_error', { operation: 'bmi_history_page', message: String(error) });
    } finally {
      if (requestGeneration.current === generation) setInitialLoading(false);
    }
  }, [db, profilesLoading, selectedProfile]);

  useFocusEffect(
    React.useCallback(() => {
      if (skipReloadVersion.current === version) {
        skipReloadVersion.current = null;
        setLoadingMore(false);
        return;
      }

      void reload();
      return () => {
        requestGeneration.current += 1;
        loadingMoreRef.current = false;
      };
    }, [reload, version]),
  );

  const loadNextPage = React.useCallback(
    async (retry = false) => {
      if (!selectedProfile || !nextCursor || loadingMoreRef.current || (loadMoreError && !retry)) {
        return;
      }

      const generation = requestGeneration.current;
      loadingMoreRef.current = true;
      setLoadingMore(true);
      if (retry) setLoadMoreError(null);

      try {
        const page = await bmiRepository.listPage(
          db,
          selectedProfile.id,
          BMI_HISTORY_PAGE_SIZE,
          nextCursor,
        );
        if (requestGeneration.current !== generation) return;
        setMeasurements((current) => {
          const currentIds = new Set(current.map((measurement) => measurement.id));
          return [
            ...current,
            ...page.measurements.filter((measurement) => !currentIds.has(measurement.id)),
          ];
        });
        setNextCursor(page.nextCursor);
      } catch (error) {
        if (requestGeneration.current !== generation) return;
        const message = error instanceof Error ? error.message : 'Please try again.';
        setLoadMoreError(message);
        track('database_error', { operation: 'bmi_history_next_page', message: String(error) });
      } finally {
        if (requestGeneration.current === generation) {
          loadingMoreRef.current = false;
          setLoadingMore(false);
        }
      }
    },
    [db, loadMoreError, nextCursor, selectedProfile],
  );

  const confirmDelete = React.useCallback(
    (measurement: BmiMeasurement) => {
      const date = new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(measurement.measuredAt));
      Alert.alert(
        'Delete measurement?',
        `This will permanently remove the BMI entry from ${date}.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => {
              if (!selectedProfile) return;
              void bmiRepository
                .remove(db, selectedProfile.id, measurement.id)
                .then(() => {
                  setMeasurements((current) =>
                    current.filter((item) => item.id !== measurement.id),
                  );
                  skipReloadVersion.current = version + 1;
                  notifyDataChanged();
                  track('bmi_measurement_deleted', { measurementId: measurement.id });
                  successFeedback();
                })
                .catch((error) => {
                  track('database_error', { operation: 'bmi_delete', message: String(error) });
                  Alert.alert(
                    'Measurement was not deleted',
                    error instanceof Error ? error.message : 'Please try again.',
                  );
                });
            },
          },
        ],
      );
    },
    [db, notifyDataChanged, selectedProfile, version],
  );

  const header = selectedProfile ? (
    <View style={{ gap: 14 }}>
      <SelectedProfileCard profile={selectedProfile} />
      <Text selectable style={{ color: theme.colors.textMuted, fontSize: 14, lineHeight: 20 }}>
        Newest measurements appear first. Tap to edit or swipe left to delete.
      </Text>
    </View>
  ) : null;

  const footer = loadingMore ? (
    <ActivityIndicator
      color={theme.colors.accent}
      accessibilityLabel="Loading more measurements"
      style={{ padding: 24 }}
    />
  ) : loadMoreError ? (
    <View style={{ alignItems: 'center', paddingVertical: 20, gap: 10 }}>
      <Text selectable style={{ color: theme.colors.textMuted, textAlign: 'center' }}>
        More history could not be loaded. {loadMoreError}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => void loadNextPage(true)}
        testID="retry-bmi-history-page"
        style={({ pressed }) => ({
          borderRadius: 12,
          borderCurve: 'continuous',
          backgroundColor: theme.colors.accentSoft,
          paddingHorizontal: 16,
          paddingVertical: 10,
          opacity: pressed ? 0.72 : 1,
        })}
      >
        <Text selectable style={{ color: theme.colors.accent, fontWeight: '800' }}>
          Retry
        </Text>
      </Pressable>
    </View>
  ) : null;

  return (
    <FlatList
      data={measurements}
      keyExtractor={(measurement) => measurement.id}
      renderItem={({ item }) => (
        <BmiMeasurementRow measurement={item} onDelete={() => confirmDelete(item)} />
      )}
      ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      ListHeaderComponent={header}
      ListHeaderComponentStyle={{ paddingBottom: selectedProfile ? 14 : 0 }}
      ListEmptyComponent={
        initialLoading ? (
          <ActivityIndicator
            color={theme.colors.accent}
            accessibilityLabel="Loading BMI and weight history"
            style={{ padding: 40 }}
          />
        ) : initialError ? (
          <View style={{ gap: 14 }}>
            <EmptyState title="History could not be loaded" message={initialError} />
            <AppButton label="Try Again" onPress={() => void reload()} />
          </View>
        ) : selectedProfile ? (
          <EmptyState
            title="No measurements yet"
            message="Add a BMI measurement to start your history."
            icon={{ name: 'scale-bathroom' }}
          />
        ) : null
      }
      ListFooterComponent={footer}
      onEndReached={() => void loadNextPage()}
      onEndReachedThreshold={0.35}
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{
        width: '100%',
        maxWidth: readableContentMaxWidth,
        flexGrow: measurements.length === 0 ? 1 : undefined,
        alignSelf: 'center',
        paddingHorizontal: horizontalPadding,
        paddingTop: horizontalPadding,
        paddingBottom: 40,
      }}
      testID="bmi-history-list"
    />
  );
}
