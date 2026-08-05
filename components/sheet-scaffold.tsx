import React from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '@/theme/use-app-theme';
import { formContentMaxWidth, useResponsiveLayout } from '@/theme/use-responsive-layout';

interface SheetScaffoldProps extends React.PropsWithChildren {
  footer: React.ReactNode;
  testID?: string;
}

export function SheetScaffold({ children, footer, testID }: SheetScaffoldProps): React.ReactElement {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { compact } = useResponsiveLayout();
  const horizontalPadding = compact ? 14 : 20;
  return (
    <>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        style={{ flex: 1, backgroundColor: theme.colors.background }}
        testID={testID}
        contentContainerStyle={{
          paddingHorizontal: horizontalPadding,
          paddingTop: 20,
          paddingBottom: 98 + insets.bottom,
        }}
      >
        <View style={{ width: '100%', maxWidth: formContentMaxWidth, alignSelf: 'center', gap: 18 }}>
          {children}
        </View>
      </ScrollView>
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: horizontalPadding,
          paddingTop: 12,
          paddingBottom: Math.max(insets.bottom, 16),
          backgroundColor: theme.colors.background,
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
        }}
      >
        <View style={{ width: '100%', maxWidth: formContentMaxWidth, alignSelf: 'center' }}>
          {footer}
        </View>
      </View>
    </>
  );
}
