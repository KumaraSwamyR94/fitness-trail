import React from 'react';
import { Pressable, Text, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';

import { useAppTheme } from '@/theme/use-app-theme';

interface SwipeActionRowProps extends React.PropsWithChildren {
  onDelete: () => void;
  deleteLabel: string;
}

export function SwipeActionRow({ children, onDelete, deleteLabel }: SwipeActionRowProps) {
  const theme = useAppTheme();
  return (
    <ReanimatedSwipeable
      friction={2}
      rightThreshold={44}
      overshootRight={false}
      renderRightActions={() => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={deleteLabel}
          onPress={onDelete}
          style={{
            width: 94,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 18,
            borderCurve: 'continuous',
            backgroundColor: theme.colors.danger,
          }}
        >
          <Text style={{ color: '#FFFFFF', fontWeight: '800' }}>Delete</Text>
        </Pressable>
      )}
    >
      <View>{children}</View>
    </ReanimatedSwipeable>
  );
}
