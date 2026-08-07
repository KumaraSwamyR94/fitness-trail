import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import React from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';

import { bmiRepository } from '@/data/bmi-repository';
import { useDataChange } from '@/data/data-change-context';
import { BmiMeasurementForm } from '@/features/bmi/bmi-measurement-form';
import { useAppTheme } from '@/theme/use-app-theme';
import type { BmiMeasurementInput } from '@/types/bmi';
import { successFeedback } from '@/utils/feedback';
import { track } from '@/utils/telemetry';

export default function EditBmiMeasurementScreen(): React.ReactElement {
  const { measurementId } = useLocalSearchParams<{ measurementId: string }>();
  const db = useSQLiteContext();
  const theme = useAppTheme();
  const { notifyDataChanged } = useDataChange();
  const [initialValue, setInitialValue] = React.useState<BmiMeasurementInput | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    void bmiRepository.get(db, measurementId).then((measurement) => {
      if (!measurement) {
        Alert.alert('Measurement not found', 'It may have already been deleted.', [
          { text: 'Close', onPress: () => router.back() },
        ]);
        return;
      }
      setInitialValue({
        measuredAt: new Date(measurement.measuredAt),
        inputWeight: measurement.inputWeight,
        inputWeightUnit: measurement.inputWeightUnit,
        inputHeightUnit: measurement.inputHeightUnit,
        heightCm: measurement.heightCm,
        ageYears: measurement.ageYears,
        gender: measurement.gender,
      });
    }).catch((error) => {
      track('database_error', { operation: 'bmi_get', message: String(error) });
      Alert.alert('Measurement could not be loaded', error instanceof Error ? error.message : 'Please try again.');
    });
  }, [db, measurementId]);

  if (!initialValue) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background }}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  const save = async (input: BmiMeasurementInput) => {
    setSubmitting(true);
    try {
      await bmiRepository.update(db, measurementId, input);
      notifyDataChanged();
      track('bmi_measurement_updated', { measurementId });
      successFeedback();
      router.back();
    } catch (error) {
      track('database_error', { operation: 'bmi_update', message: String(error) });
      Alert.alert('Measurement was not updated', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <BmiMeasurementForm
      initialValue={initialValue}
      submitLabel="Save Changes"
      submitting={submitting}
      onSubmit={save}
    />
  );
}
