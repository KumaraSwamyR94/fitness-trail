import { Stack } from 'expo-router';

import { useAppTheme } from '@/theme/use-app-theme';

const sheetOptions = process.env.EXPO_OS === 'ios'
  ? {
      presentation: 'formSheet' as const,
      sheetGrabberVisible: true,
      sheetAllowedDetents: [0.65, 1],
    }
  : {
      presentation: 'modal' as const,
    };

export default function WorkoutsLayout(): React.ReactElement {
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
      <Stack.Screen name="index" options={{ title: 'Fitness Trail' }} />
      <Stack.Screen name="sessions/new" options={{ ...sheetOptions, title: 'New Session' }} />
      <Stack.Screen name="sessions/[sessionId]/index" options={{ title: 'Session' }} />
      <Stack.Screen name="sessions/[sessionId]/edit" options={{ ...sheetOptions, title: 'Edit Session' }} />
      <Stack.Screen
        name="sessions/[sessionId]/exercises/new"
        options={{ ...sheetOptions, title: 'Add Exercise', sheetAllowedDetents: [0.8, 1] }}
      />
      <Stack.Screen name="sessions/[sessionId]/exercises/[exerciseId]/index" options={{ title: 'Exercise' }} />
      <Stack.Screen
        name="sessions/[sessionId]/exercises/[exerciseId]/sets/new"
        options={{ ...sheetOptions, title: 'Add Set' }}
      />
      <Stack.Screen
        name="sessions/[sessionId]/exercises/[exerciseId]/sets/[setId]"
        options={{ ...sheetOptions, title: 'Edit Set' }}
      />
    </Stack>
  );
}
