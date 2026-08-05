import * as Haptics from 'expo-haptics';
import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { SymbolIcon } from '@/components/symbol-icon';
import { useAppTheme } from '@/theme/use-app-theme';

interface AppButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  icon?: { name: string; fallback: string };
  testID?: string;
}

export function AppButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  variant = 'primary',
  icon,
  testID,
}: AppButtonProps): React.ReactElement {
  const theme = useAppTheme();
  const background =
    variant === 'primary'
      ? theme.colors.accent
      : variant === 'danger'
        ? theme.colors.danger
        : theme.colors.surfaceMuted;
  const foreground = variant === 'secondary' ? theme.colors.text : '#FFFFFF';

  const handlePress = () => {
    if (process.env.EXPO_OS === 'ios') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || loading}
      onPress={handlePress}
      testID={testID}
      style={({ pressed }) => ({
        minHeight: 50,
        borderRadius: 16,
        borderCurve: 'continuous',
        backgroundColor: background,
        opacity: disabled || loading ? 0.5 : pressed ? 0.82 : 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 18,
        paddingVertical: 12,
      })}
    >
      {loading ? (
        <ActivityIndicator color={foreground} />
      ) : (
        <View style={{ width: '100%', minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          {icon ? <SymbolIcon {...icon} color={foreground} /> : null}
          <Text
            selectable
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.72}
            style={{ minWidth: 0, flexShrink: 1, color: foreground, fontSize: 16, fontWeight: '700', textAlign: 'center' }}
          >
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
