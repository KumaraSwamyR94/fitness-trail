import SegmentedControl from '@react-native-segmented-control/segmented-control';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import React from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, Text, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { BmiMeasurementRow } from '@/components/bmi-measurement-row';
import { BmiTrendChart } from '@/components/bmi-trend-chart';
import { EmptyState } from '@/components/empty-state';
import { SelectedProfileCard } from '@/components/selected-profile-card';
import { bmiRepository } from '@/data/bmi-repository';
import { useDataChange } from '@/data/data-change-context';
import { useProfiles } from '@/data/profile-context';
import { useAppTheme } from '@/theme/use-app-theme';
import { readableContentMaxWidth, useResponsiveLayout } from '@/theme/use-responsive-layout';
import type { BmiMeasurement, BmiMetric, BmiRange } from '@/types/bmi';
import {
  BMI_CATEGORY_LABELS,
  BMI_RANGES,
  calculateBmiRangeAverages,
  classifyAdultBmi,
  filterMeasurementsByRange,
  formatBmi,
  formatHeight,
} from '@/utils/bmi';
import { successFeedback } from '@/utils/feedback';
import { track } from '@/utils/telemetry';
import { formatWeight } from '@/utils/weight';

const DASHBOARD_HISTORY_LIMIT = 5;

export default function BmiDashboardScreen(): React.ReactElement {
  const db = useSQLiteContext();
  const theme = useAppTheme();
  const { horizontalPadding } = useResponsiveLayout();
  const { version, notifyDataChanged } = useDataChange();
  const { selectedProfile, loading: profilesLoading } = useProfiles();
  const [measurements, setMeasurements] = React.useState<BmiMeasurement[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [metric, setMetric] = React.useState<BmiMetric>('bmi');
  const [range, setRange] = React.useState<BmiRange>('1W');

  const load = React.useCallback(async () => {
    setLoading(true);
    if (!selectedProfile) {
      setMeasurements([]);
      setLoading(false);
      return;
    }
    try {
      setMeasurements(await bmiRepository.listAll(db, selectedProfile.id));
    } catch (error) {
      track('database_error', { operation: 'bmi_list', message: String(error) });
      Alert.alert(
        'BMI history could not be loaded',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setLoading(false);
    }
  }, [db, selectedProfile]);

  useFocusEffect(
    React.useCallback(() => {
      void version;
      void load();
    }, [load, version]),
  );

  const latest = measurements[0];
  const previous = measurements[1];
  const filteredMeasurements = React.useMemo(
    () => filterMeasurementsByRange(measurements, range),
    [measurements, range],
  );
  const weightUnit = latest?.inputWeightUnit ?? 'kg';
  const averages = React.useMemo(
    () => calculateBmiRangeAverages(filteredMeasurements, weightUnit),
    [filteredMeasurements, weightUnit],
  );

  const confirmDelete = React.useCallback(
    (measurement: BmiMeasurement) => {
      Alert.alert(
        'Delete measurement?',
        `This will permanently remove the BMI entry from ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(measurement.measuredAt))}.`,
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
    [db, notifyDataChanged, selectedProfile],
  );

  const header = (
    <View style={{ gap: 18 }}>
      <View style={{ gap: 4 }}>
        <Text
          selectable
          style={{
            color: theme.colors.accent,
            fontSize: 13,
            fontWeight: '800',
            letterSpacing: 0.7,
          }}
        >
          BODY MEASUREMENT JOURNAL
        </Text>
        <Text selectable style={{ color: theme.colors.textMuted, fontSize: 16, lineHeight: 22 }}>
          Follow changes over time with private, on-device tracking.
        </Text>
      </View>

      {selectedProfile ? <SelectedProfileCard profile={selectedProfile} /> : null}

      {!selectedProfile && !profilesLoading ? (
        <View
          style={{
            backgroundColor: theme.colors.surface,
            borderRadius: 20,
            borderCurve: 'continuous',
          }}
        >
          <EmptyState
            title="Choose a profile first"
            message="Create a profile before adding BMI measurements."
            icon={{ name: 'account-plus-outline' }}
          />
        </View>
      ) : loading && !latest ? (
        <ActivityIndicator color={theme.colors.accent} style={{ padding: 34 }} />
      ) : latest ? (
        <View
          accessibilityRole="summary"
          style={{
            borderRadius: 22,
            borderCurve: 'continuous',
            backgroundColor: theme.colors.surface,
            borderWidth: 1,
            borderColor: theme.colors.border,
            padding: 18,
            gap: 14,
            boxShadow: '0 4px 16px rgba(15, 23, 42, 0.07)',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text
                selectable
                style={{
                  color: theme.colors.textMuted,
                  fontSize: 12,
                  fontWeight: '800',
                  letterSpacing: 0.7,
                }}
              >
                LATEST BMI
              </Text>
              <Text
                selectable
                style={{
                  color: theme.colors.text,
                  fontSize: 44,
                  lineHeight: 50,
                  fontWeight: '900',
                  fontVariant: ['tabular-nums'],
                }}
              >
                {formatBmi(latest.bmi)}
              </Text>
              <Text
                selectable
                style={{ color: theme.colors.accent, fontSize: 15, fontWeight: '800' }}
              >
                {BMI_CATEGORY_LABELS[classifyAdultBmi(latest.bmi)]}
              </Text>
            </View>
            {previous ? (
              <View
                style={{
                  borderRadius: 12,
                  backgroundColor: theme.colors.surfaceMuted,
                  paddingHorizontal: 11,
                  paddingVertical: 8,
                }}
              >
                <Text
                  selectable
                  style={{
                    color: theme.colors.textMuted,
                    fontSize: 12,
                    fontWeight: '700',
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {latest.bmi - previous.bmi >= 0 ? '+' : ''}
                  {(latest.bmi - previous.bmi).toFixed(1)} since last
                </Text>
              </View>
            ) : null}
          </View>
          <View style={{ height: 1, backgroundColor: theme.colors.border }} />
          <View style={{ flexDirection: 'row', gap: 16 }}>
            <View style={{ flex: 1, gap: 3 }}>
              <Text
                selectable
                style={{ color: theme.colors.textMuted, fontSize: 11, fontWeight: '800' }}
              >
                WEIGHT
              </Text>
              <Text
                selectable
                style={{
                  color: theme.colors.text,
                  fontSize: 17,
                  fontWeight: '800',
                  fontVariant: ['tabular-nums'],
                }}
              >
                {formatWeight(latest.inputWeight)} {latest.inputWeightUnit}
              </Text>
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text
                selectable
                style={{ color: theme.colors.textMuted, fontSize: 11, fontWeight: '800' }}
              >
                HEIGHT
              </Text>
              <Text
                selectable
                style={{
                  color: theme.colors.text,
                  fontSize: 17,
                  fontWeight: '800',
                  fontVariant: ['tabular-nums'],
                }}
              >
                {formatHeight(latest.heightCm, latest.inputHeightUnit)}
              </Text>
            </View>
          </View>
        </View>
      ) : (
        <View
          style={{
            backgroundColor: theme.colors.surface,
            borderRadius: 20,
            borderCurve: 'continuous',
          }}
        >
          <EmptyState
            title="Start your BMI trail"
            message="Add your first measurement to see a current BMI, trend chart, and history."
            icon={{ name: 'scale-bathroom' }}
          />
        </View>
      )}

      <AppButton
        label={selectedProfile ? 'Add Measurement' : 'Create Profile'}
        icon={{ name: selectedProfile ? 'plus' : 'account-plus-outline' }}
        onPress={() => router.push(selectedProfile ? '/bmi/measurements/new' : '/profiles/new')}
        testID="add-bmi-measurement"
      />

      {selectedProfile ? (
        <View
          style={{
            borderRadius: 20,
            borderCurve: 'continuous',
            backgroundColor: theme.colors.surface,
            borderWidth: 1,
            borderColor: theme.colors.border,
            padding: 15,
            gap: 13,
          }}
        >
          <View style={{ gap: 4 }}>
            <Text selectable style={{ color: theme.colors.text, fontSize: 18, fontWeight: '800' }}>
              Trend
            </Text>
            <Text selectable style={{ color: theme.colors.textMuted, fontSize: 13 }}>
              {metric === 'bmi' ? 'BMI over time' : `Weight over time (${weightUnit})`}
            </Text>
          </View>
          <SegmentedControl
            accessibilityLabel="Trend metric"
            values={['BMI', 'Weight']}
            selectedIndex={metric === 'bmi' ? 0 : 1}
            onChange={(event) =>
              setMetric(event.nativeEvent.selectedSegmentIndex === 0 ? 'bmi' : 'weight')
            }
            style={{ height: 40 }}
            testID="bmi-metric-control"
          />
          <SegmentedControl
            accessibilityLabel="Trend time range"
            values={[...BMI_RANGES]}
            selectedIndex={BMI_RANGES.indexOf(range)}
            onChange={(event) => setRange(BMI_RANGES[event.nativeEvent.selectedSegmentIndex])}
            style={{ height: 40 }}
            testID="bmi-range-control"
          />
          <View style={{ flexDirection: 'row', gap: 10 }} testID="bmi-range-averages">
            <View
              accessible
              accessibilityRole="summary"
              accessibilityLabel={`Average BMI, ${averages.averageBmi === null ? 'No data' : formatBmi(averages.averageBmi)}`}
              style={{
                flex: 1,
                borderRadius: 14,
                borderCurve: 'continuous',
                backgroundColor: theme.colors.surfaceMuted,
                padding: 12,
                gap: 4,
              }}
            >
              <Text
                selectable
                style={{
                  color: theme.colors.textMuted,
                  fontSize: 11,
                  fontWeight: '800',
                  letterSpacing: 0.5,
                }}
              >
                AVERAGE BMI
              </Text>
              <Text
                selectable
                testID="average-bmi-value"
                style={{
                  color: theme.colors.text,
                  fontSize: 20,
                  fontWeight: '900',
                  fontVariant: ['tabular-nums'],
                }}
              >
                {averages.averageBmi === null ? 'No data' : formatBmi(averages.averageBmi)}
              </Text>
            </View>
            <View
              accessible
              accessibilityRole="summary"
              accessibilityLabel={`Average weight, ${
                averages.averageWeight === null
                  ? 'No data'
                  : `${formatWeight(averages.averageWeight)} ${weightUnit}`
              }`}
              style={{
                flex: 1,
                borderRadius: 14,
                borderCurve: 'continuous',
                backgroundColor: theme.colors.surfaceMuted,
                padding: 12,
                gap: 4,
              }}
            >
              <Text
                selectable
                style={{
                  color: theme.colors.textMuted,
                  fontSize: 11,
                  fontWeight: '800',
                  letterSpacing: 0.5,
                }}
              >
                AVERAGE WEIGHT
              </Text>
              <Text
                selectable
                testID="average-weight-value"
                style={{
                  color: theme.colors.text,
                  fontSize: 20,
                  fontWeight: '900',
                  fontVariant: ['tabular-nums'],
                }}
              >
                {averages.averageWeight === null
                  ? 'No data'
                  : `${formatWeight(averages.averageWeight)} ${weightUnit}`}
              </Text>
            </View>
          </View>
          <BmiTrendChart
            measurements={filteredMeasurements}
            metric={metric}
            weightUnit={weightUnit}
          />
        </View>
      ) : null}

      {selectedProfile ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <View style={{ flex: 1, gap: 4 }}>
            <Text selectable style={{ color: theme.colors.text, fontSize: 20, fontWeight: '900' }}>
              History
            </Text>
            <Text selectable style={{ color: theme.colors.textMuted, fontSize: 13 }}>
              Tap to edit or swipe left to delete.
            </Text>
          </View>
          {measurements.length > DASHBOARD_HISTORY_LIMIT ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="View all BMI and weight history"
              accessibilityHint="Opens the complete measurement history."
              onPress={() => router.push('/bmi/history')}
              hitSlop={8}
              testID="view-more-bmi-history"
              style={({ pressed }) => ({
                borderRadius: 12,
                borderCurve: 'continuous',
                backgroundColor: theme.colors.accentSoft,
                paddingHorizontal: 12,
                paddingVertical: 9,
                opacity: pressed ? 0.72 : 1,
              })}
            >
              <Text
                selectable
                style={{ color: theme.colors.accent, fontSize: 14, fontWeight: '800' }}
              >
                View More
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  return (
    <FlatList
      data={measurements.slice(0, DASHBOARD_HISTORY_LIMIT)}
      keyExtractor={(measurement) => measurement.id}
      renderItem={({ item }) => (
        <BmiMeasurementRow measurement={item} onDelete={() => confirmDelete(item)} />
      )}
      ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      ListHeaderComponent={header}
      ListHeaderComponentStyle={{ paddingBottom: measurements.length > 0 ? 12 : 0 }}
      ListEmptyComponent={
        !loading && selectedProfile ? (
          <Text
            selectable
            style={{ color: theme.colors.textMuted, textAlign: 'center', paddingVertical: 12 }}
          >
            Your saved measurements will appear here.
          </Text>
        ) : null
      }
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{
        width: '100%',
        maxWidth: readableContentMaxWidth,
        alignSelf: 'center',
        paddingHorizontal: horizontalPadding,
        paddingTop: horizontalPadding,
        paddingBottom: 40,
      }}
      testID="bmi-dashboard"
    />
  );
}
