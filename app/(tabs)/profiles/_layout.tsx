import { Stack } from 'expo-router';

import { useAppTheme } from '@/theme/use-app-theme';

const sheetOptions =
  process.env.EXPO_OS === 'ios'
    ? {
        presentation: 'formSheet' as const,
        sheetGrabberVisible: true,
        sheetAllowedDetents: [0.82, 1],
      }
    : { presentation: 'modal' as const };

export default function ProfilesLayout(): React.ReactElement {
  const theme = useAppTheme();
  return (
    <Stack
      screenOptions={{
        headerBackButtonDisplayMode: 'minimal',
        headerShadowVisible: false,
        headerStyle: { backgroundColor: theme.colors.background },
        headerTintColor: theme.colors.text,
        contentStyle: { backgroundColor: theme.colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Profiles' }} />
      <Stack.Screen name="data-sync" options={{ title: 'Data & Sync' }} />
      <Stack.Screen name="new" options={{ ...sheetOptions, title: 'New Profile' }} />
      <Stack.Screen name="[profileId]" options={{ ...sheetOptions, title: 'Edit Profile' }} />
    </Stack>
  );
}
