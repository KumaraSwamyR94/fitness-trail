import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import React from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppIcon } from '@/components/app-icon';
import { EmptyState } from '@/components/empty-state';
import { ProfileAvatar } from '@/components/profile-avatar';
import { useDataChange } from '@/data/data-change-context';
import { useProfiles } from '@/data/profile-context';
import { profileRepository } from '@/data/profile-repository';
import { useAppTheme } from '@/theme/use-app-theme';
import { readableContentMaxWidth, useResponsiveLayout } from '@/theme/use-responsive-layout';
import type { Profile } from '@/types/profile';
import { formatHeight } from '@/utils/bmi';
import { successFeedback, warningFeedback } from '@/utils/feedback';
import { removePrivateProfilePhoto } from '@/utils/profile-media';
import { profileAgeOnDate } from '@/utils/profiles';
import { track } from '@/utils/telemetry';

export default function SelectProfileScreen(): React.ReactElement {
  const db = useSQLiteContext();
  const theme = useAppTheme();
  const { horizontalPadding } = useResponsiveLayout();
  const { version, notifyDataChanged } = useDataChange();
  const { profiles, selectedProfile, loading, refreshProfiles, selectProfile } = useProfiles();
  const [selectingId, setSelectingId] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  useFocusEffect(
    React.useCallback(() => {
      void version;
      let active = true;
      void refreshProfiles().catch((error) => {
        if (!active) return;
        Alert.alert(
          'Profiles could not be refreshed',
          error instanceof Error ? error.message : 'Please try again.',
        );
      });
      return () => {
        active = false;
      };
    }, [refreshProfiles, version]),
  );

  const choose = async (profile: Profile) => {
    if (profile.id === selectedProfile?.id || selectingId) return;
    setSelectingId(profile.id);
    try {
      await selectProfile(profile.id);
      successFeedback();
    } catch (error) {
      Alert.alert(
        'Profile was not selected',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setSelectingId(null);
    }
  };

  const removeProfile = async (profile: Profile) => {
    setDeletingId(profile.id);
    try {
      await profileRepository.remove(db, profile.id);
      try {
        removePrivateProfilePhoto(profile.photo);
      } catch (error) {
        track('database_error', {
          operation: 'profile_photo_cleanup',
          message: String(error),
        });
      }
      await refreshProfiles();
      notifyDataChanged();
      warningFeedback();
      track('profile_deleted', { profileId: profile.id });
    } catch (error) {
      Alert.alert(
        'Profile was not deleted',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setDeletingId(null);
    }
  };

  const confirmDelete = async (profile: Profile) => {
    try {
      const stats = await profileRepository.getOverview(db, profile.id);
      const history = stats
        ? `${stats.sessionCount} sessions, ${stats.setCount} sets, and ${stats.bmiMeasurementCount} BMI measurements`
        : 'all of its workout and BMI history';
      Alert.alert(
        `Delete ${profile.name}?`,
        `This permanently deletes ${history}. This cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete Profile and Data',
            style: 'destructive',
            onPress: () => void removeProfile(profile),
          },
        ],
      );
    } catch (error) {
      Alert.alert(
        'Profile details could not be loaded',
        error instanceof Error ? error.message : 'Please try again.',
      );
    }
  };

  const createButton = (
    <AppButton
      label="Create Profile"
      icon={{ name: 'account-plus-outline' }}
      onPress={() => router.push('/profiles/new')}
      testID="add-profile"
    />
  );

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        width: '100%',
        maxWidth: readableContentMaxWidth,
        alignSelf: 'center',
        paddingHorizontal: horizontalPadding,
        paddingTop: horizontalPadding,
        paddingBottom: 42,
        gap: 16,
      }}
    >
      {loading ? (
        <ActivityIndicator color={theme.colors.accent} style={{ padding: 40 }} />
      ) : profiles.length === 0 ? (
        <View style={{ gap: 16 }}>
          <View
            style={{
              backgroundColor: theme.colors.surface,
              borderRadius: 20,
              borderCurve: 'continuous',
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <EmptyState
              title="No profiles yet"
              message="Create a profile to keep each person’s workout and BMI history separate."
              icon={{ name: 'account-plus-outline' }}
            />
          </View>
          {createButton}
        </View>
      ) : (
        <>
          <Text selectable style={{ color: theme.colors.textMuted, fontSize: 15, lineHeight: 21 }}>
            Choose the profile you want to use. Workout and BMI history remain separate for each
            profile.
          </Text>

          <View accessibilityRole="radiogroup" style={{ gap: 10 }}>
            {profiles.map((profile) => {
              const active = profile.id === selectedProfile?.id;
              const selecting = selectingId === profile.id;
              const deleting = deletingId === profile.id;
              const actionsDisabled = selectingId !== null || deletingId !== null;

              return (
                <View
                  key={profile.id}
                  style={{
                    minHeight: 84,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    borderRadius: 18,
                    borderCurve: 'continuous',
                    borderWidth: active ? 2 : 1,
                    borderColor: active ? theme.colors.accent : theme.colors.border,
                    backgroundColor: active ? theme.colors.accentSoft : theme.colors.surface,
                    padding: 10,
                  }}
                >
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{
                      checked: active,
                      busy: selecting,
                      disabled: actionsDisabled,
                    }}
                    accessibilityLabel={`${profile.name}${active ? ', selected' : ''}`}
                    disabled={actionsDisabled}
                    onPress={() => void choose(profile)}
                    testID={`select-profile-${profile.id}`}
                    style={({ pressed }) => ({
                      minWidth: 0,
                      flex: 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                      borderRadius: 14,
                      borderCurve: 'continuous',
                      padding: 2,
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <ProfileAvatar name={profile.name} photo={profile.photo} size={50} />
                    <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                        <Text
                          selectable
                          numberOfLines={2}
                          style={{
                            minWidth: 0,
                            flexShrink: 1,
                            color: active ? theme.colors.accent : theme.colors.text,
                            fontSize: 15,
                            fontWeight: '800',
                          }}
                        >
                          {profile.name}
                        </Text>
                      </View>
                      <Text selectable style={{ color: theme.colors.textMuted, fontSize: 13 }}>
                        {profileAgeOnDate(profile, new Date())} years ·{' '}
                        {formatHeight(profile.heightCm, profile.inputHeightUnit)}
                      </Text>
                    </View>
                    {selecting ? (
                      <ActivityIndicator color={theme.colors.accent} />
                    ) : active ? (
                      <AppIcon name="check-circle" color={theme.colors.accent} size={22} />
                    ) : null}
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${profile.name}`}
                    accessibilityState={{ disabled: actionsDisabled }}
                    disabled={actionsDisabled}
                    onPress={() =>
                      router.push({
                        pathname: '/profiles/[profileId]',
                        params: { profileId: profile.id },
                      })
                    }
                    testID={`edit-profile-${profile.id}`}
                    hitSlop={6}
                    style={({ pressed }) => ({
                      width: 44,
                      height: 44,
                      borderRadius: 14,
                      borderCurve: 'continuous',
                      backgroundColor: theme.colors.surfaceMuted,
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: actionsDisabled ? 0.45 : pressed ? 0.72 : 1,
                    })}
                  >
                    <AppIcon name="pencil-outline" color={theme.colors.text} />
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${profile.name}`}
                    accessibilityState={{ busy: deleting, disabled: actionsDisabled }}
                    disabled={actionsDisabled}
                    onPress={() => void confirmDelete(profile)}
                    testID={`delete-profile-${profile.id}`}
                    hitSlop={6}
                    style={({ pressed }) => ({
                      width: 44,
                      height: 44,
                      borderRadius: 14,
                      borderCurve: 'continuous',
                      backgroundColor: theme.colors.dangerSoft,
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: actionsDisabled ? 0.45 : pressed ? 0.72 : 1,
                    })}
                  >
                    {deleting ? (
                      <ActivityIndicator color={theme.colors.danger} size="small" />
                    ) : (
                      <AppIcon name="trash-can-outline" color={theme.colors.danger} />
                    )}
                  </Pressable>
                </View>
              );
            })}
          </View>

          {createButton}
        </>
      )}
    </ScrollView>
  );
}
