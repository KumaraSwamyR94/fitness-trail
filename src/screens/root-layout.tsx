import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppErrorBoundary } from '@/components/app-error-boundary';
import { DataChangeProvider } from '@/data/data-change-context';
import { migrateDatabase } from '@/data/migrations';
import { useAppTheme } from '@/theme/use-app-theme';

const sheetOptions = process.env.EXPO_OS === 'ios'
  ? {
      presentation: 'formSheet' as const,
      sheetGrabberVisible: true,
      sheetAllowedDetents: [0.65, 1],
    }
  : {
      // Android's native formSheet can render as an empty Material bottom sheet
      // on some devices. A modal maps to a standard, reliable push presentation.
      presentation: 'modal' as const,
    };

function Navigation(): React.ReactElement {
  const theme = useAppTheme();
  return (
    <>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerBackButtonDisplayMode: 'minimal',
          headerShadowVisible: false,
          headerStyle: { backgroundColor: theme.colors.background },
          headerTintColor: theme.colors.text,
          contentStyle: { backgroundColor: theme.colors.background },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Fitness Trail', headerLargeTitle: true }} />
        <Stack.Screen name="sessions/new" options={{ ...sheetOptions, title: 'New Session' }} />
        <Stack.Screen name="sessions/[sessionId]/index" options={{ title: 'Session' }} />
        <Stack.Screen name="sessions/[sessionId]/edit" options={{ ...sheetOptions, title: 'Edit Session' }} />
        <Stack.Screen
          name="sessions/[sessionId]/exercises/new"
          options={{ ...sheetOptions, title: 'Add Exercise', sheetAllowedDetents: [0.8, 1] }}
        />
        <Stack.Screen
          name="sessions/[sessionId]/exercises/[exerciseId]/index"
          options={{ title: 'Exercise' }}
        />
        <Stack.Screen
          name="sessions/[sessionId]/exercises/[exerciseId]/sets/new"
          options={{ ...sheetOptions, title: 'Add Set' }}
        />
        <Stack.Screen
          name="sessions/[sessionId]/exercises/[exerciseId]/sets/[setId]"
          options={{ ...sheetOptions, title: 'Edit Set' }}
        />
        <Stack.Screen name="+not-found" options={{ title: 'Not Found' }} />
      </Stack>
    </>
  );
}

export default function RootLayout(): React.ReactElement {
  return (
    <AppErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <SQLiteProvider databaseName="fitness-trail.db" onInit={migrateDatabase}>
            <DataChangeProvider>
              <Navigation />
            </DataChangeProvider>
          </SQLiteProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </AppErrorBoundary>
  );
}
