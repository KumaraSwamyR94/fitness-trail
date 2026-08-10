import React from 'react';
import { Text } from 'react-native';

import { AppButton } from '@/components/app-button';
import { DateTimeField } from '@/components/date-time-field';
import { FormField } from '@/components/form-field';
import { SheetScaffold } from '@/components/sheet-scaffold';
import { useAppTheme } from '@/theme/use-app-theme';
import { validateName } from '@/utils/names';

interface SessionFormProps {
  initialName: string;
  initialDate: Date;
  submitLabel: string;
  onSubmit: (name: string, date: Date) => Promise<void>;
}

export function SessionForm({
  initialName,
  initialDate,
  submitLabel,
  onSubmit,
}: SessionFormProps): React.ReactElement {
  const theme = useAppTheme();
  const [name, setName] = React.useState(initialName);
  const [date, setDate] = React.useState(initialDate);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const submit = async () => {
    const validation = validateName(name);
    if (validation) {
      setError(validation);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit(name, date);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save the session.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SheetScaffold
      testID="session-form"
      footer={
        <AppButton
          label={submitLabel}
          onPress={() => void submit()}
          loading={saving}
          testID="save-session"
        />
      }
    >
      <Text selectable style={{ color: theme.colors.textMuted, lineHeight: 21 }}>
        Name the workout and choose when it belongs in your training journal.
      </Text>
      <FormField
        label="Session name"
        value={name}
        onChangeText={(value) => {
          setName(value);
          if (error) setError(null);
        }}
        autoFocus
        returnKeyType="done"
        maxLength={80}
        error={error}
        testID="session-name"
      />
      <DateTimeField value={date} onChange={setDate} />
    </SheetScaffold>
  );
}
