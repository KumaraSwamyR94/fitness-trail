import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
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
import type { ProfileOverview } from '@/types/profile';
import {
  BMI_CATEGORY_LABELS,
  classifyAdultBmi,
  formatBmi,
  formatHeight,
  GENDER_LABELS,
} from '@/utils/bmi';
import { profileAgeOnDate } from '@/utils/profiles';
import { formatWeight } from '@/utils/weight';

function Stat({ label, value }: { label: string; value: string | number }): React.ReactElement {
  const theme = useAppTheme();
  return (
    <View
      style={{
        flex: 1,
        minWidth: 88,
        gap: 3,
        borderRadius: 14,
        borderCurve: 'continuous',
        backgroundColor: theme.colors.surfaceMuted,
        padding: 12,
      }}
    >
      <Text
        selectable
        style={{
          color: theme.colors.textMuted,
          fontSize: 11,
          fontWeight: '800',
          letterSpacing: 0.45,
        }}
      >
        {label}
      </Text>
      <Text
        selectable
        style={{
          color: theme.colors.text,
          fontSize: 20,
          fontWeight: '900',
          fontVariant: ['tabular-nums'],
        }}
      >
        {value}
      </Text>
    </View>
  );
}

export default function ProfilesScreen(): React.ReactElement {
  const db = useSQLiteContext();
  const theme = useAppTheme();
  const reduceMotion = useReducedMotion();
  const { horizontalPadding } = useResponsiveLayout();
  const { version } = useDataChange();
  const { profiles, selectedProfile, loading, refreshProfiles } = useProfiles();
  const [overviewResult, setOverviewResult] = React.useState<{
    profileId: string;
    overview: ProfileOverview | null;
  } | null>(null);

  const overview =
    selectedProfile && overviewResult?.profileId === selectedProfile.id
      ? overviewResult.overview
      : null;
  const overviewLoading = Boolean(
    selectedProfile && overviewResult?.profileId !== selectedProfile.id,
  );

  const load = React.useCallback(async () => {
    await refreshProfiles();
  }, [refreshProfiles]);

  useFocusEffect(
    React.useCallback(() => {
      void version;
      void load().catch(() => undefined);
    }, [load, version]),
  );

  React.useEffect(() => {
    let active = true;

    if (!selectedProfile) return undefined;

    const profileId = selectedProfile.id;
    void profileRepository
      .getOverview(db, profileId)
      .then((nextOverview) => {
        if (active) setOverviewResult({ profileId, overview: nextOverview });
      })
      .catch(() => {
        if (active) setOverviewResult({ profileId, overview: null });
      });

    return () => {
      active = false;
    };
  }, [db, selectedProfile, version]);

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
        gap: 18,
      }}
    >
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
          PRIVATE ON-DEVICE PROFILES
        </Text>
        <Text selectable style={{ color: theme.colors.textMuted, fontSize: 16, lineHeight: 22 }}>
          Keep each person’s workouts and BMI trail separate.
        </Text>
      </View>

      {loading || overviewLoading ? (
        <ActivityIndicator color={theme.colors.accent} style={{ padding: 40 }} />
      ) : overview && selectedProfile && overview.id === selectedProfile.id ? (
        <Animated.View
          entering={reduceMotion ? undefined : FadeIn.duration(180)}
          layout={reduceMotion ? undefined : LinearTransition.duration(180)}
          style={{
            borderRadius: 22,
            borderCurve: 'continuous',
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
            padding: 17,
            gap: 16,
            boxShadow: '0 4px 16px rgba(15, 23, 42, 0.07)',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <ProfileAvatar name={overview.name} photo={overview.photo} size={72} />
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <Text
                selectable
                style={{
                  color: theme.colors.textMuted,
                  fontSize: 11,
                  fontWeight: '800',
                  letterSpacing: 0.6,
                }}
              >
                ACTIVE PROFILE
              </Text>
              <Text
                selectable
                numberOfLines={1}
                style={{ color: theme.colors.text, fontSize: 24, fontWeight: '900' }}
              >
                {overview.name}
              </Text>
              <Text selectable style={{ color: theme.colors.textMuted, fontSize: 14 }}>
                {profileAgeOnDate(overview, new Date())} years · {GENDER_LABELS[overview.gender]} ·{' '}
                {formatHeight(overview.heightCm, overview.inputHeightUnit)}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Edit ${overview.name}`}
              onPress={() =>
                router.push({
                  pathname: '/profiles/[profileId]',
                  params: { profileId: overview.id },
                })
              }
              hitSlop={8}
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                borderCurve: 'continuous',
                backgroundColor: theme.colors.surfaceMuted,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AppIcon name="pencil" color={theme.colors.accent} />
            </Pressable>
          </View>
          <View style={{ gap: 9 }}>
            <Text selectable style={{ color: theme.colors.text, fontSize: 16, fontWeight: '800' }}>
              Workout trail
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Stat label="SESSIONS" value={overview.sessionCount} />
              <Stat label="EXERCISES" value={overview.exerciseCount} />
              <Stat label="SETS" value={overview.setCount} />
            </View>
            <AppButton label="View Workouts" variant="secondary" onPress={() => router.push('/')} />
          </View>
          <View style={{ height: 1, backgroundColor: theme.colors.border }} />
          <View style={{ gap: 9 }}>
            <Text selectable style={{ color: theme.colors.text, fontSize: 16, fontWeight: '800' }}>
              BMI trail
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Stat label="MEASUREMENTS" value={overview.bmiMeasurementCount} />
              <Stat
                label="LATEST BMI"
                value={overview.latestBmi === null ? '—' : formatBmi(overview.latestBmi)}
              />
              <Stat
                label="LATEST WEIGHT"
                value={
                  overview.latestWeight === null || !overview.latestWeightUnit
                    ? '—'
                    : `${formatWeight(overview.latestWeight)} ${overview.latestWeightUnit}`
                }
              />
            </View>
            {overview.latestBmi !== null ? (
              <Text
                selectable
                style={{ color: theme.colors.accent, fontSize: 14, fontWeight: '800' }}
              >
                {BMI_CATEGORY_LABELS[classifyAdultBmi(overview.latestBmi)]}
              </Text>
            ) : null}
            <AppButton label="View BMI" variant="secondary" onPress={() => router.push('/bmi')} />
          </View>
        </Animated.View>
      ) : (
        <View
          style={{
            backgroundColor: theme.colors.surface,
            borderRadius: 20,
            borderCurve: 'continuous',
          }}
        >
          <EmptyState
            title={selectedProfile ? 'Profile details unavailable' : 'No profiles yet'}
            message={
              selectedProfile
                ? 'Please try opening this screen again.'
                : 'Create a profile to keep workout and BMI history separate.'
            }
            icon={{ name: 'account-plus-outline' }}
          />
        </View>
      )}

      {profiles.length === 0 ? (
        <AppButton
          label="Create Profile"
          icon={{ name: 'account-plus-outline' }}
          onPress={() => router.push('/profiles/new')}
          testID="add-profile"
        />
      ) : null}

      {profiles.length > 1 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Select Profile"
          onPress={() => router.push('/profiles/select')}
          testID="open-profile-selector"
          style={({ pressed }) => ({
            minHeight: 56,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            borderRadius: 16,
            borderCurve: 'continuous',
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.surface,
            paddingHorizontal: 14,
            opacity: pressed ? 0.78 : 1,
          })}
        >
          <AppIcon name="account-multiple-outline" color={theme.colors.accent} size={22} />
          <Text selectable style={{ flex: 1, color: theme.colors.text, fontWeight: '800' }}>
            Select Profile
          </Text>
          <AppIcon name="chevron-right" color={theme.colors.textMuted} size={22} />
        </Pressable>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open Import and Export"
        onPress={() => router.push('/profiles/data-sync')}
        testID="open-import-export"
        style={({ pressed }) => ({
          minHeight: 84,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          borderRadius: 20,
          borderCurve: 'continuous',
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.surface,
          padding: 16,
          opacity: pressed ? 0.78 : 1,
        })}
      >
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            borderCurve: 'continuous',
            backgroundColor: theme.colors.accentSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <AppIcon name="swap-horizontal" color={theme.colors.accent} size={23} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text selectable style={{ color: theme.colors.text, fontSize: 17, fontWeight: '900' }}>
            Import & Export
          </Text>
          <Text selectable style={{ color: theme.colors.textMuted, fontSize: 13, lineHeight: 18 }}>
            Back up, restore, or transfer workout and BMI history.
          </Text>
        </View>
        <AppIcon name="chevron-right" color={theme.colors.textMuted} size={22} />
      </Pressable>
    </ScrollView>
  );
}
