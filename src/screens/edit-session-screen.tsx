import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useDataChange } from '@/data/data-change-context';
import { useProfiles } from '@/data/profile-context';
import { sessionRepository } from '@/data/session-repository';
import { SessionForm } from '@/features/sessions/session-form';
import { useAppTheme } from '@/theme/use-app-theme';
import type { Session } from '@/types/workout';
import { track } from '@/utils/telemetry';

export default function EditSessionScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const db = useSQLiteContext();
  const theme = useAppTheme();
  const { notifyDataChanged } = useDataChange();
  const { selectedProfile, loading } = useProfiles();
  const [session, setSession] = React.useState<Session | null>(null);

  React.useEffect(() => {
    if (loading) return;
    if (!selectedProfile) {
      router.replace('/');
      return;
    }
    void sessionRepository.get(db, selectedProfile.id, sessionId).then((value) => {
      if (!value) router.replace('/');
      else setSession(value);
    });
  }, [db, loading, selectedProfile, sessionId]);

  if (!session) {
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

  return (
    <SessionForm
      initialName={session.name}
      initialDate={new Date(session.scheduledAt)}
      submitLabel="Save Changes"
      onSubmit={async (name, date) => {
        await sessionRepository.update(db, selectedProfile!.id, sessionId, name, date);
        notifyDataChanged();
        track('session_updated', { sessionId });
        router.back();
      }}
    />
  );
}
