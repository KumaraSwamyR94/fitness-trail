import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import React from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';

import { bmiRepository } from '@/data/bmi-repository';
import { useDataChange } from '@/data/data-change-context';
import { useProfiles } from '@/data/profile-context';
import { BmiMeasurementForm } from '@/features/bmi/bmi-measurement-form';
import { useAppTheme } from '@/theme/use-app-theme';
import type { BmiMeasurement, BmiMeasurementDraft } from '@/types/bmi';
import { successFeedback } from '@/utils/feedback';
import { track } from '@/utils/telemetry';

export default function EditBmiMeasurementScreen(): React.ReactElement {
  const { measurementId } = useLocalSearchParams<{ measurementId: string }>();
  const db = useSQLiteContext();
  const theme = useAppTheme();
  const { notifyDataChanged } = useDataChange();
  const { selectedProfile, loading: profilesLoading } = useProfiles();
  const [measurement, setMeasurement] = React.useState<BmiMeasurement | null>(null);
  const [initialValue, setInitialValue] = React.useState<BmiMeasurementDraft | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (profilesLoading) return;
    if (!selectedProfile) {
      router.replace('/bmi');
      return;
    }
    void bmiRepository
      .get(db, selectedProfile.id, measurementId)
      .then((value) => {
        if (!value) {
          Alert.alert('Measurement not found', 'It may have already been deleted.', [
            { text: 'Close', onPress: () => router.replace('/bmi') },
          ]);
          return;
        }
        setMeasurement(value);
        setInitialValue({
          measuredAt: new Date(value.measuredAt),
          inputWeight: value.inputWeight,
          inputWeightUnit: value.inputWeightUnit,
        });
      })
      .catch((error) => {
        track('database_error', { operation: 'bmi_get', message: String(error) });
        Alert.alert(
          'Measurement could not be loaded',
          error instanceof Error ? error.message : 'Please try again.',
        );
      });
  }, [db, measurementId, profilesLoading, selectedProfile]);

  if (!initialValue) {
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
      await bmiRepository.update(db, selectedProfile.id, measurementId, input);
      notifyDataChanged();
      track('bmi_measurement_updated', { measurementId });
      successFeedback();
      router.back();
    } catch (error) {
      track('database_error', { operation: 'bmi_update', message: String(error) });
      Alert.alert(
        'Measurement was not updated',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <BmiMeasurementForm
      profile={selectedProfile!}
      snapshot={measurement!}
      initialValue={initialValue}
      submitLabel="Save Changes"
      submitting={submitting}
      onSubmit={save}
    />
  );
}
