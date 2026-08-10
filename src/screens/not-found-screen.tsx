import { Link } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';

import { useAppTheme } from '@/theme/use-app-theme';
import { formContentMaxWidth } from '@/theme/use-responsive-layout';

export default function NotFoundScreen() {
  const theme = useAppTheme();
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        flexGrow: 1,
        padding: 24,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
      }}
    >
      <View style={{ width: '100%', maxWidth: formContentMaxWidth, alignItems: 'center', gap: 12 }}>
        <Text
          selectable
          style={{ color: theme.colors.text, fontSize: 22, fontWeight: '800', textAlign: 'center' }}
        >
          This journal page does not exist.
        </Text>
        <Link
          href="/"
          style={{
            color: theme.colors.accent,
            fontSize: 16,
            fontWeight: '700',
            textAlign: 'center',
          }}
        >
          Return to the calendar
        </Link>
      </View>
    </ScrollView>
  );
}
