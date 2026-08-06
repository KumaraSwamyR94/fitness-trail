import React from 'react';
import { Text, TextInput, type TextInputProps, View } from 'react-native';

import { useAppTheme } from '@/theme/use-app-theme';

interface FormFieldProps extends TextInputProps {
  label: string;
  error?: string | null;
}

export function FormField({ label, error, style, ...props }: FormFieldProps): React.ReactElement {
  const theme = useAppTheme();
  return (
    <View style={{ gap: 7 }}>
      <Text selectable style={{ color: theme.colors.text, fontSize: 14, fontWeight: '700' }}>
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={theme.colors.textMuted}
        selectionColor={theme.colors.accent}
        style={[
          {
            minHeight: 50,
            borderRadius: 14,
            borderCurve: 'continuous',
            borderWidth: 1,
            borderColor: error ? theme.colors.danger : theme.colors.border,
            backgroundColor: theme.colors.surface,
            color: theme.colors.text,
            width: '100%',
            paddingHorizontal: 14,
            paddingVertical: 12,
            fontSize: 16,
            textAlignVertical: 'center',
          },
          style,
        ]}
        {...props}
      />
      {error ? (
        <Text selectable accessibilityLiveRegion="polite" style={{ color: theme.colors.danger, fontSize: 13 }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
