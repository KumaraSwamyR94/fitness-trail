import { Stack } from 'expo-router';

import { useAppTheme } from '@/theme/use-app-theme';

const sheetOptions =
  process.env.EXPO_OS === 'ios'
    ? {
        presentation: 'formSheet' as const,
        sheetGrabberVisible: true,
        sheetAllowedDetents: [0.8, 1],
      }
    : {
        presentation: 'modal' as const,
      };

export default function BmiLayout(): React.ReactElement {
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
      <Stack.Screen name="index" options={{ title: 'BMI' }} />
      <Stack.Screen name="history" options={{ title: 'BMI & Weight History' }} />
      <Stack.Screen
        name="measurements/new"
        options={{ ...sheetOptions, title: 'New Measurement' }}
      />
      <Stack.Screen
        name="measurements/[measurementId]"
        options={{ ...sheetOptions, title: 'Edit Measurement' }}
      />
    </Stack>
  );
}
