import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import React from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';

import { useDataChange } from '@/data/data-change-context';
import { useProfiles } from '@/data/profile-context';
import { profileRepository } from '@/data/profile-repository';
import { ProfileForm } from '@/features/profiles/profile-form';
import { useAppTheme } from '@/theme/use-app-theme';
import type { Profile, ProfileInput } from '@/types/profile';
import { successFeedback } from '@/utils/feedback';
import { removePrivateProfilePhoto } from '@/utils/profile-media';
import { track } from '@/utils/telemetry';

export default function EditProfileScreen(): React.ReactElement {
  const { profileId } = useLocalSearchParams<{ profileId: string }>();
  const db = useSQLiteContext();
  const theme = useAppTheme();
  const { refreshProfiles } = useProfiles();
  const { notifyDataChanged } = useDataChange();
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    void profileRepository.get(db, profileId).then((value) => {
      if (!value) {
        Alert.alert('Profile not found', 'It may have already been deleted.', [{ text: 'Close', onPress: () => router.back() }]);
      } else setProfile(value);
    });
  }, [db, profileId]);

  if (!profile) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background }}><ActivityIndicator color={theme.colors.accent} /></View>;
  }

  const save = async (input: ProfileInput) => {
    setSubmitting(true);
    try {
      await profileRepository.update(db, profileId, input);
      if (profile.photo.kind === 'local' && profile.photo.ref !== input.photo.ref) {
        removePrivateProfilePhoto(profile.photo);
      }
      await refreshProfiles();
      notifyDataChanged();
      track('profile_updated', { profileId });
      successFeedback();
      router.back();
    } catch (error) {
      Alert.alert('Profile was not updated', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return <ProfileForm initialValue={profile} submitLabel="Save Changes" submitting={submitting} onSubmit={save} />;
}
