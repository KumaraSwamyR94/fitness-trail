import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppErrorBoundary } from '@/components/app-error-boundary';
import { DataChangeProvider } from '@/data/data-change-context';
import { migrateDatabase } from '@/data/migrations';
import { ProfileProvider } from '@/data/profile-context';
import { useAppTheme } from '@/theme/use-app-theme';

function Navigation(): React.ReactElement {
  const theme = useAppTheme();
  return (
    <>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="+not-found"
          options={{
            headerShown: true,
            title: 'Not Found',
            headerShadowVisible: false,
            headerStyle: { backgroundColor: theme.colors.background },
            headerTintColor: theme.colors.text,
          }}
        />
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
              <ProfileProvider>
                <Navigation />
              </ProfileProvider>
            </DataChangeProvider>
          </SQLiteProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </AppErrorBoundary>
  );
}
