import React from 'react';
import { Keyboard, KeyboardAvoidingView, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '@/theme/use-app-theme';
import { formContentMaxWidth, useResponsiveLayout } from '@/theme/use-responsive-layout';

interface SheetScaffoldProps extends React.PropsWithChildren {
  footer: React.ReactNode;
  testID?: string;
}

export function SheetScaffold({
  children,
  footer,
  testID,
}: SheetScaffoldProps): React.ReactElement {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { compact } = useResponsiveLayout();
  const [keyboardVisible, setKeyboardVisible] = React.useState(false);
  const horizontalPadding = compact ? 14 : 20;

  React.useEffect(() => {
    const showEvent = process.env.EXPO_OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = process.env.EXPO_OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSubscription = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSubscription = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  return (
    <KeyboardAvoidingView
      behavior="height"
      enabled={process.env.EXPO_OS === 'android'}
      collapsable={false}
      style={{ flex: 1, backgroundColor: theme.colors.background }}
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode={process.env.EXPO_OS === 'ios' ? 'interactive' : 'on-drag'}
        keyboardShouldPersistTaps="handled"
        style={{ flex: 1, backgroundColor: theme.colors.background }}
        testID={testID}
        contentContainerStyle={{
          paddingHorizontal: horizontalPadding,
          paddingTop: 20,
          paddingBottom: 20,
        }}
      >
        <View
          style={{ width: '100%', maxWidth: formContentMaxWidth, alignSelf: 'center', gap: 18 }}
        >
          {children}
        </View>
      </ScrollView>
      {!keyboardVisible ? (
        <View
          style={{
            flexShrink: 0,
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
      ) : null}
    </KeyboardAvoidingView>
  );
}
