import { router } from 'expo-router';
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

export default function NewBmiMeasurementScreen(): React.ReactElement {
  const db = useSQLiteContext();
  const theme = useAppTheme();
  const { notifyDataChanged } = useDataChange();
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [initialValue, setInitialValue] = React.useState<BmiMeasurementInput | undefined>();

  React.useEffect(() => {
    void bmiRepository.getLatest(db).then((latest) => {
      if (latest) {
        setInitialValue({
          measuredAt: new Date(),
          inputWeight: latest.inputWeight,
          inputWeightUnit: latest.inputWeightUnit,
          inputHeightUnit: latest.inputHeightUnit,
          heightCm: latest.heightCm,
          ageYears: latest.ageYears,
          gender: latest.gender,
        });
      }
    }).catch((error) => {
      track('database_error', { operation: 'bmi_latest', message: String(error) });
      Alert.alert('Previous values could not be loaded', 'You can still enter a new measurement.');
    }).finally(() => setLoading(false));
  }, [db]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background }}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  const save = async (input: BmiMeasurementInput) => {
    setSubmitting(true);
    try {
      const created = await bmiRepository.create(db, input);
      notifyDataChanged();
      track('bmi_measurement_created', { measurementId: created.id });
      successFeedback();
      router.back();
    } catch (error) {
      track('database_error', { operation: 'bmi_create', message: String(error) });
      Alert.alert('Measurement was not saved', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <BmiMeasurementForm
      initialValue={initialValue}
      submitLabel="Add Measurement"
      submitting={submitting}
      onSubmit={save}
    />
  );
}
