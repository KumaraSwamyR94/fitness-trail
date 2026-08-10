import React from 'react';
import { ScrollView, Text, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { formContentMaxWidth } from '@/theme/use-responsive-layout';

interface State {
  error: Error | null;
}

export class AppErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          style={{ flex: 1, backgroundColor: '#08111F' }}
          contentContainerStyle={{
            flexGrow: 1,
            padding: 28,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View style={{ width: '100%', maxWidth: formContentMaxWidth, gap: 14 }}>
            <Text
              selectable
              style={{ color: '#F8FAFC', fontSize: 22, fontWeight: '800', textAlign: 'center' }}
            >
              Fitness Trail could not open its journal
            </Text>
            <Text selectable style={{ color: '#9FB0C6', textAlign: 'center', lineHeight: 20 }}>
              {this.state.error.message}
            </Text>
            <AppButton label="Try again" onPress={() => this.setState({ error: null })} />
          </View>
        </ScrollView>
      );
    }
    return this.props.children;
  }
}
