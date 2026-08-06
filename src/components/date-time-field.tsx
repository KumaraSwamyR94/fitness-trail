import DateTimePicker from '@react-native-community/datetimepicker';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { useAppTheme } from '@/theme/use-app-theme';
import { useResponsiveLayout } from '@/theme/use-responsive-layout';
import { mergeDateAndTime } from '@/utils/dates';

interface DateTimeFieldProps {
  value: Date;
  onChange: (value: Date) => void;
}

export function DateTimeField({ value, onChange }: DateTimeFieldProps): React.ReactElement {
  const theme = useAppTheme();
  const { compact } = useResponsiveLayout();
  const [androidMode, setAndroidMode] = React.useState<'date' | 'time' | null>(null);
  const dateLabel = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(value);
  const timeLabel = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(value);
  const dismissAndroidPicker = () => {
    if (process.env.EXPO_OS !== 'ios') setAndroidMode(null);
  };

  const picker = (mode: 'date' | 'time') => (
    <DateTimePicker
      value={value}
      mode={mode}
      display={process.env.EXPO_OS === 'ios' ? 'compact' : 'default'}
      onValueChange={(_, next) => {
        dismissAndroidPicker();
        onChange(mode === 'date' ? mergeDateAndTime(next, value) : mergeDateAndTime(value, next));
      }}
      onDismiss={dismissAndroidPicker}
    />
  );

  return (
    <View style={{ gap: 8 }}>
      <Text selectable style={{ color: theme.colors.text, fontSize: 14, fontWeight: '700' }}>
        Date and time
      </Text>
      {process.env.EXPO_OS === 'ios' ? (
        <View
          style={{
            minHeight: 54,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            paddingHorizontal: 12,
            borderRadius: 14,
            borderCurve: 'continuous',
            backgroundColor: theme.colors.surface,
            borderWidth: 1,
            borderColor: theme.colors.border,
          }}
        >
          {picker('date')}
          {picker('time')}
        </View>
      ) : (
        <View style={{ flexDirection: compact ? 'column' : 'row', gap: 10 }}>
          {[
            { mode: 'date' as const, label: dateLabel },
            { mode: 'time' as const, label: timeLabel },
          ].map((item) => (
            <Pressable
              key={item.mode}
              accessibilityRole="button"
              accessibilityLabel={`Choose ${item.mode}`}
              onPress={() => setAndroidMode(item.mode)}
              style={{
                flex: compact ? undefined : 1,
                width: compact ? '100%' : undefined,
                minWidth: 0,
                minHeight: 50,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 14,
                borderCurve: 'continuous',
                backgroundColor: theme.colors.surface,
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}
            >
              <Text
                selectable
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
                style={{ maxWidth: '100%', color: theme.colors.text, fontWeight: '600', textAlign: 'center' }}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
          {androidMode ? picker(androidMode) : null}
        </View>
      )}
    </View>
  );
}
