import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import React from 'react';
import { Alert } from 'react-native';

import { useDataChange } from '@/data/data-change-context';
import { useProfiles } from '@/data/profile-context';
import { profileRepository } from '@/data/profile-repository';
import { ProfileForm } from '@/features/profiles/profile-form';
import type { ProfileInput } from '@/types/profile';
import { successFeedback } from '@/utils/feedback';
import { track } from '@/utils/telemetry';

export default function NewProfileScreen(): React.ReactElement {
  const db = useSQLiteContext();
  const { refreshProfiles } = useProfiles();
  const { notifyDataChanged } = useDataChange();
  const [submitting, setSubmitting] = React.useState(false);

  const save = async (input: ProfileInput) => {
    setSubmitting(true);
    try {
      const profile = await profileRepository.create(db, input);
      await refreshProfiles();
      notifyDataChanged();
      track('profile_created', { profileId: profile.id });
      successFeedback();
      router.back();
    } catch (error) {
      Alert.alert('Profile was not saved', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return <ProfileForm submitLabel="Create Profile" submitting={submitting} onSubmit={save} />;
}
