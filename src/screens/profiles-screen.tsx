import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import React from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeIn, LinearTransition, useReducedMotion } from 'react-native-reanimated';

import { AppButton } from '@/components/app-button';
import { AppIcon } from '@/components/app-icon';
import { EmptyState } from '@/components/empty-state';
import { ProfileAvatar } from '@/components/profile-avatar';
import { useDataChange } from '@/data/data-change-context';
import { useProfiles } from '@/data/profile-context';
import { profileRepository } from '@/data/profile-repository';
import { useAppTheme } from '@/theme/use-app-theme';
import { readableContentMaxWidth, useResponsiveLayout } from '@/theme/use-responsive-layout';
import type { Profile, ProfileOverview } from '@/types/profile';
import { BMI_CATEGORY_LABELS, classifyAdultBmi, formatBmi, formatHeight, GENDER_LABELS } from '@/utils/bmi';
import { successFeedback, warningFeedback } from '@/utils/feedback';
import { removePrivateProfilePhoto } from '@/utils/profile-media';
import { profileAgeOnDate } from '@/utils/profiles';
import { track } from '@/utils/telemetry';
import { formatWeight } from '@/utils/weight';

function Stat({ label, value }: { label: string; value: string | number }): React.ReactElement {
  const theme = useAppTheme();
  return (
    <View style={{ flex: 1, minWidth: 88, gap: 3, borderRadius: 14, borderCurve: 'continuous', backgroundColor: theme.colors.surfaceMuted, padding: 12 }}>
      <Text selectable style={{ color: theme.colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 0.45 }}>{label}</Text>
      <Text selectable style={{ color: theme.colors.text, fontSize: 20, fontWeight: '900', fontVariant: ['tabular-nums'] }}>{value}</Text>
    </View>
  );
}

export default function ProfilesScreen(): React.ReactElement {
  const db = useSQLiteContext();
  const theme = useAppTheme();
  const reduceMotion = useReducedMotion();
  const { horizontalPadding } = useResponsiveLayout();
  const { version, notifyDataChanged } = useDataChange();
  const { profiles, selectedProfile, loading, refreshProfiles, selectProfile } = useProfiles();
  const [overview, setOverview] = React.useState<ProfileOverview | null>(null);
  const [selectingId, setSelectingId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    await refreshProfiles();
  }, [refreshProfiles]);

  useFocusEffect(React.useCallback(() => {
    void version;
    void load();
  }, [load, version]));

  React.useEffect(() => {
    if (selectedProfile) void profileRepository.getOverview(db, selectedProfile.id).then(setOverview);
  }, [db, selectedProfile, version]);

  const choose = async (profile: Profile) => {
    if (profile.id === selectedProfile?.id) return;
    setSelectingId(profile.id);
    try {
      await selectProfile(profile.id);
      successFeedback();
    } catch (error) {
      Alert.alert('Profile was not selected', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSelectingId(null);
    }
  };

  const confirmDelete = async (profile: Profile) => {
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
          onPress: () => {
            void profileRepository.remove(db, profile.id).then(async () => {
              removePrivateProfilePhoto(profile.photo);
              await refreshProfiles();
              notifyDataChanged();
              warningFeedback();
              track('profile_deleted', { profileId: profile.id });
            }).catch((error) => Alert.alert('Profile was not deleted', error instanceof Error ? error.message : 'Please try again.'));
          },
        },
      ],
    );
  };

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ width: '100%', maxWidth: readableContentMaxWidth, alignSelf: 'center', paddingHorizontal: horizontalPadding, paddingTop: horizontalPadding, paddingBottom: 42, gap: 18 }}
    >
      <View style={{ gap: 4 }}>
        <Text selectable style={{ color: theme.colors.accent, fontSize: 13, fontWeight: '800', letterSpacing: 0.7 }}>PRIVATE ON-DEVICE PROFILES</Text>
        <Text selectable style={{ color: theme.colors.textMuted, fontSize: 16, lineHeight: 22 }}>Keep each person’s workouts and BMI trail separate.</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={theme.colors.accent} style={{ padding: 40 }} />
      ) : overview && selectedProfile && overview.id === selectedProfile.id ? (
        <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(180)} layout={reduceMotion ? undefined : LinearTransition.duration(180)} style={{ borderRadius: 22, borderCurve: 'continuous', borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, padding: 17, gap: 16, boxShadow: '0 4px 16px rgba(15, 23, 42, 0.07)' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <ProfileAvatar name={overview.name} photo={overview.photo} size={72} />
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <Text selectable style={{ color: theme.colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 0.6 }}>ACTIVE PROFILE</Text>
              <Text selectable numberOfLines={1} style={{ color: theme.colors.text, fontSize: 24, fontWeight: '900' }}>{overview.name}</Text>
              <Text selectable style={{ color: theme.colors.textMuted, fontSize: 14 }}>{profileAgeOnDate(overview, new Date())} years · {GENDER_LABELS[overview.gender]} · {formatHeight(overview.heightCm, overview.inputHeightUnit)}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${overview.name}`} onPress={() => router.push({ pathname: '/profiles/[profileId]', params: { profileId: overview.id } })} hitSlop={8} style={{ width: 44, height: 44, borderRadius: 14, borderCurve: 'continuous', backgroundColor: theme.colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' }}><AppIcon name="pencil" color={theme.colors.accent} /></Pressable>
          </View>
          <View style={{ gap: 9 }}>
            <Text selectable style={{ color: theme.colors.text, fontSize: 16, fontWeight: '800' }}>Workout trail</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}><Stat label="SESSIONS" value={overview.sessionCount} /><Stat label="EXERCISES" value={overview.exerciseCount} /><Stat label="SETS" value={overview.setCount} /></View>
            <AppButton label="View Workouts" variant="secondary" onPress={() => router.push('/')} />
          </View>
          <View style={{ height: 1, backgroundColor: theme.colors.border }} />
          <View style={{ gap: 9 }}>
            <Text selectable style={{ color: theme.colors.text, fontSize: 16, fontWeight: '800' }}>BMI trail</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Stat label="MEASUREMENTS" value={overview.bmiMeasurementCount} />
              <Stat label="LATEST BMI" value={overview.latestBmi === null ? '—' : formatBmi(overview.latestBmi)} />
              <Stat label="LATEST WEIGHT" value={overview.latestWeight === null || !overview.latestWeightUnit ? '—' : `${formatWeight(overview.latestWeight)} ${overview.latestWeightUnit}`} />
            </View>
            {overview.latestBmi !== null ? <Text selectable style={{ color: theme.colors.accent, fontSize: 14, fontWeight: '800' }}>{BMI_CATEGORY_LABELS[classifyAdultBmi(overview.latestBmi)]}</Text> : null}
            <AppButton label="View BMI" variant="secondary" onPress={() => router.push('/bmi')} />
          </View>
        </Animated.View>
      ) : (
        <View style={{ backgroundColor: theme.colors.surface, borderRadius: 20, borderCurve: 'continuous' }}>
          <EmptyState title="Create your first profile" message="Your existing workout and BMI history will be assigned to the first profile you create." icon={{ name: 'account-plus-outline' }} />
        </View>
      )}

      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flex: 1, gap: 2 }}><Text selectable style={{ color: theme.colors.text, fontSize: 20, fontWeight: '900' }}>Profiles</Text><Text selectable style={{ color: theme.colors.textMuted, fontSize: 13 }}>Tap a card to switch.</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Add profile" onPress={() => router.push('/profiles/new')} style={({ pressed }) => ({ width: 46, height: 46, borderRadius: 15, borderCurve: 'continuous', backgroundColor: theme.colors.accent, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}><AppIcon name="plus" color="#FFFFFF" size={24} /></Pressable>
        </View>
        {profiles.map((profile) => {
          const active = profile.id === selectedProfile?.id;
          return (
            <Pressable key={profile.id} accessibilityRole="radio" accessibilityState={{ checked: active, busy: selectingId === profile.id }} accessibilityLabel={`${profile.name}${active ? ', selected' : ''}`} onPress={() => void choose(profile)} style={({ pressed }) => ({ minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, borderCurve: 'continuous', borderWidth: active ? 2 : 1, borderColor: active ? theme.colors.accent : theme.colors.border, backgroundColor: active ? theme.colors.accentSoft : theme.colors.surface, padding: 12, opacity: pressed ? 0.76 : 1 })}>
              <ProfileAvatar name={profile.name} photo={profile.photo} size={50} />
              <View style={{ flex: 1, minWidth: 0, gap: 3 }}><Text selectable numberOfLines={1} style={{ color: active ? theme.colors.accent : theme.colors.text, fontSize: 17, fontWeight: '800' }}>{profile.name}</Text><Text selectable style={{ color: theme.colors.textMuted, fontSize: 13 }}>{profileAgeOnDate(profile, new Date())} years · {formatHeight(profile.heightCm, profile.inputHeightUnit)}</Text></View>
              {selectingId === profile.id ? <ActivityIndicator color={theme.colors.accent} /> : active ? <AppIcon name="check-circle" color={theme.colors.accent} size={23} /> : null}
              <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${profile.name}`} onPress={() => router.push({ pathname: '/profiles/[profileId]', params: { profileId: profile.id } })} hitSlop={8} style={{ padding: 8 }}><AppIcon name="pencil-outline" color={theme.colors.textMuted} /></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${profile.name}`} onPress={() => void confirmDelete(profile)} hitSlop={8} style={{ padding: 8 }}><AppIcon name="trash-can-outline" color={theme.colors.danger} /></Pressable>
            </Pressable>
          );
        })}
      </View>

      <AppButton label="Add Profile" icon={{ name: 'account-plus-outline' }} onPress={() => router.push('/profiles/new')} testID="add-profile" />
    </ScrollView>
  );
}
