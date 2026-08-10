import { Link, router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeIn, LinearTransition, useReducedMotion } from 'react-native-reanimated';

import { AppButton } from '@/components/app-button';
import { EmptyState } from '@/components/empty-state';
import { MonthCalendar } from '@/components/month-calendar';
import { SelectedProfileCard } from '@/components/selected-profile-card';
import { useDataChange } from '@/data/data-change-context';
import { useProfiles } from '@/data/profile-context';
import { sessionRepository } from '@/data/session-repository';
import { useAppTheme } from '@/theme/use-app-theme';
import { readableContentMaxWidth, useResponsiveLayout } from '@/theme/use-responsive-layout';
import type { SessionSummary } from '@/types/workout';
import {
  addMonths,
  fromLocalDateKey,
  monthRange,
  startOfMonth,
  toLocalDateKey,
} from '@/utils/dates';

export default function DashboardScreen(): React.ReactElement {
  const db = useSQLiteContext();
  const theme = useAppTheme();
  const { horizontalPadding } = useResponsiveLayout();
  const reduceMotion = useReducedMotion();
  const { version } = useDataChange();
  const { selectedProfile, loading: profilesLoading } = useProfiles();
  const today = React.useMemo(() => new Date(), []);
  const [month, setMonth] = React.useState(() => startOfMonth(today));
  const [selectedKey, setSelectedKey] = React.useState(() => toLocalDateKey(today));
  const [sessions, setSessions] = React.useState<SessionSummary[]>([]);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);
    if (!selectedProfile) {
      setSessions([]);
      setLoading(false);
      return;
    }
    const range = monthRange(month);
    try {
      setSessions(
        await sessionRepository.listBetween(db, selectedProfile.id, range.start, range.end),
      );
    } finally {
      setLoading(false);
    }
  }, [db, month, selectedProfile]);

  useFocusEffect(
    React.useCallback(() => {
      void version;
      void load();
    }, [load, version]),
  );

  const changeMonth = React.useCallback((amount: number) => {
    setMonth((current) => {
      const next = addMonths(current, amount);
      setSelectedKey(toLocalDateKey(next));
      return next;
    });
  }, []);

  const marked = React.useMemo(
    () => new Set(sessions.map((session) => session.localDate)),
    [sessions],
  );
  const selectedSessions = sessions.filter((session) => session.localDate === selectedKey);
  const selectedLabel = new Intl.DateTimeFormat(undefined, { dateStyle: 'full' }).format(
    fromLocalDateKey(selectedKey),
  );

  return (
    <View collapsable={false} style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          width: '100%',
          maxWidth: readableContentMaxWidth,
          alignSelf: 'center',
          paddingHorizontal: horizontalPadding,
          paddingTop: horizontalPadding,
          paddingBottom: 40,
          gap: 18,
        }}
        refreshControl={undefined}
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
            STRENGTH TRAINING JOURNAL & TRACKER
          </Text>
          <Text selectable style={{ color: theme.colors.textMuted, fontSize: 16, lineHeight: 22 }}>
            Follow the trail your training leaves behind.
          </Text>
        </View>

        {selectedProfile ? (
          <SelectedProfileCard profile={selectedProfile} />
        ) : !profilesLoading ? (
          <View
            style={{
              backgroundColor: theme.colors.surface,
              borderRadius: 20,
              borderCurve: 'continuous',
            }}
          >
            <EmptyState
              title="Choose a profile first"
              message="Create a profile to keep this workout trail separate and start logging sessions."
              icon={{ name: 'account-plus-outline' }}
            />
          </View>
        ) : null}

        {selectedProfile ? (
          <>
            <MonthCalendar
              month={month}
              selectedKey={selectedKey}
              markedKeys={marked}
              onSelect={(key) => {
                setSelectedKey(key);
                const selected = fromLocalDateKey(key);
                if (selected.getMonth() !== month.getMonth()) setMonth(startOfMonth(selected));
              }}
              onPrevious={() => changeMonth(-1)}
              onNext={() => changeMonth(1)}
            />

            <View style={{ gap: 10 }}>
              <Text
                selectable
                style={{ color: theme.colors.text, fontSize: 18, fontWeight: '800' }}
              >
                {selectedLabel}
              </Text>
              {loading ? (
                <ActivityIndicator color={theme.colors.accent} style={{ padding: 30 }} />
              ) : selectedSessions.length === 0 ? (
                <View
                  style={{
                    backgroundColor: theme.colors.surface,
                    borderRadius: 20,
                    borderCurve: 'continuous',
                  }}
                >
                  <EmptyState
                    title="A rest day—or a fresh start"
                    message="No sessions are logged for this date. Start one whenever you are ready."
                  />
                </View>
              ) : (
                selectedSessions.map((session) => (
                  <Animated.View
                    key={session.id}
                    entering={reduceMotion ? undefined : FadeIn.duration(180)}
                    layout={reduceMotion ? undefined : LinearTransition.duration(180)}
                  >
                    <Link
                      href={{
                        pathname: '/sessions/[sessionId]',
                        params: { sessionId: session.id },
                      }}
                      asChild
                    >
                      <Pressable
                        accessibilityLabel={`${session.name}, ${session.exerciseCount} exercises, ${session.setCount} sets`}
                        style={({ pressed }) => ({
                          backgroundColor: theme.colors.surface,
                          borderRadius: 18,
                          borderCurve: 'continuous',
                          borderWidth: 1,
                          borderColor: theme.colors.border,
                          padding: 16,
                          gap: 5,
                          opacity: pressed ? 0.76 : 1,
                        })}
                      >
                        <Text
                          selectable
                          style={{ color: theme.colors.text, fontSize: 17, fontWeight: '800' }}
                        >
                          {session.name}
                        </Text>
                        <Text selectable style={{ color: theme.colors.textMuted, fontSize: 14 }}>
                          {new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(
                            session.scheduledAt,
                          )}{' '}
                          · {session.exerciseCount}{' '}
                          {session.exerciseCount === 1 ? 'exercise' : 'exercises'} ·{' '}
                          {session.setCount} {session.setCount === 1 ? 'set' : 'sets'}
                        </Text>
                      </Pressable>
                    </Link>
                  </Animated.View>
                ))
              )}
            </View>
          </>
        ) : null}

        <AppButton
          label={selectedProfile ? 'Start New Session' : 'Create Profile'}
          onPress={() => router.push(selectedProfile ? '/sessions/new' : '/profiles/new')}
          icon={{ name: selectedProfile ? 'plus' : 'account-plus-outline' }}
          testID="start-new-session"
        />
      </ScrollView>
    </View>
  );
}
