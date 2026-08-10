import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import React from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';

import { bmiRepository } from '@/data/bmi-repository';
import { useDataChange } from '@/data/data-change-context';
import { useProfiles } from '@/data/profile-context';
import { BmiMeasurementForm } from '@/features/bmi/bmi-measurement-form';
import { useAppTheme } from '@/theme/use-app-theme';
import type { BmiMeasurementDraft } from '@/types/bmi';
import { successFeedback } from '@/utils/feedback';
import { track } from '@/utils/telemetry';

export default function NewBmiMeasurementScreen(): React.ReactElement {
  const db = useSQLiteContext();
  const theme = useAppTheme();
  const { notifyDataChanged } = useDataChange();
  const { selectedProfile, loading: profilesLoading } = useProfiles();
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [initialValue, setInitialValue] = React.useState<BmiMeasurementDraft | undefined>();

  React.useEffect(() => {
    if (profilesLoading) return;
    if (!selectedProfile) {
      router.replace('/profiles/new');
      return;
    }
    void bmiRepository
      .getLatest(db, selectedProfile.id)
      .then((latest) => {
        if (latest) {
          setInitialValue({
            measuredAt: new Date(),
            inputWeight: latest.inputWeight,
            inputWeightUnit: latest.inputWeightUnit,
          });
        }
      })
      .catch((error) => {
        track('database_error', { operation: 'bmi_latest', message: String(error) });
        Alert.alert(
          'Previous values could not be loaded',
          'You can still enter a new measurement.',
        );
      })
      .finally(() => setLoading(false));
  }, [db, profilesLoading, selectedProfile]);

  if (loading) {
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

  const save = async (input: BmiMeasurementDraft) => {
    setSubmitting(true);
    try {
      if (!selectedProfile) throw new Error('Choose a profile first.');
      const created = await bmiRepository.create(db, selectedProfile, input);
      notifyDataChanged();
      track('bmi_measurement_created', { measurementId: created.id });
      successFeedback();
      router.back();
    } catch (error) {
      track('database_error', { operation: 'bmi_create', message: String(error) });
      Alert.alert(
        'Measurement was not saved',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <BmiMeasurementForm
      profile={selectedProfile!}
      initialValue={initialValue}
      submitLabel="Add Measurement"
      submitting={submitting}
      onSubmit={save}
    />
  );
}
