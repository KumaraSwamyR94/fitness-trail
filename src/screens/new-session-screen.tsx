import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { useDataChange } from '@/data/data-change-context';
import { sessionRepository } from '@/data/session-repository';
import { SessionForm } from '@/features/sessions/session-form';
import { successFeedback } from '@/utils/feedback';
import { track } from '@/utils/telemetry';

export default function NewSessionScreen() {
  const db = useSQLiteContext();
  const { notifyDataChanged } = useDataChange();
  const now = new Date();
  const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(now);

  return (
    <SessionForm
      initialName={`${weekday} Session`}
      initialDate={now}
      submitLabel="Create Session"
      onSubmit={async (name, date) => {
        const session = await sessionRepository.create(db, name, date);
        notifyDataChanged();
        track('session_created', { sessionId: session.id });
        successFeedback();
        router.replace({ pathname: '/sessions/[sessionId]', params: { sessionId: session.id } });
      }}
    />
  );
}
