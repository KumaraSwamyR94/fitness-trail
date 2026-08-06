import { Text, View } from 'react-native';

import { SymbolIcon } from '@/components/symbol-icon';
import { useAppTheme } from '@/theme/use-app-theme';
import { useResponsiveLayout } from '@/theme/use-responsive-layout';

interface EmptyStateProps {
  title: string;
  message: string;
  icon?: { name: string; fallback: string };
}

export function EmptyState({
  title,
  message,
  icon = { name: 'figure.strengthtraining.traditional', fallback: '◇' },
}: EmptyStateProps) {
  const theme = useAppTheme();
  const { compact } = useResponsiveLayout();
  return (
    <View
      accessibilityRole="summary"
      style={{ alignItems: 'center', justifyContent: 'center', gap: 8, padding: compact ? 20 : 28 }}
    >
      <View
        style={{
          width: 54,
          height: 54,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 27,
          backgroundColor: theme.colors.accentSoft,
        }}
      >
        <SymbolIcon {...icon} color={theme.colors.accent} size={24} />
      </View>
      <Text selectable style={{ color: theme.colors.text, fontSize: 18, fontWeight: '800', textAlign: 'center' }}>
        {title}
      </Text>
      <Text selectable style={{ color: theme.colors.textMuted, fontSize: 14, lineHeight: 20, textAlign: 'center' }}>
        {message}
      </Text>
    </View>
  );
}
