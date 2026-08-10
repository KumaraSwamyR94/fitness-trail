import { router } from 'expo-router';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { ProfileAvatar } from '@/components/profile-avatar';
import { useAppTheme } from '@/theme/use-app-theme';
import type { Profile } from '@/types/profile';

export function SelectedProfileCard({ profile }: { profile: Profile }): React.ReactElement {
  const theme = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Selected profile ${profile.name}. Change profile.`}
      onPress={() => router.push('/profiles')}
      style={({ pressed }) => ({
        minHeight: 68,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderRadius: 18,
        borderCurve: 'continuous',
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        padding: 12,
        opacity: pressed ? 0.76 : 1,
      })}
    >
      <ProfileAvatar name={profile.name} photo={profile.photo} size={46} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text
          selectable
          style={{
            color: theme.colors.textMuted,
            fontSize: 11,
            fontWeight: '800',
            letterSpacing: 0.5,
          }}
        >
          SELECTED PROFILE
        </Text>
        <Text
          selectable
          numberOfLines={1}
          style={{ color: theme.colors.text, fontSize: 17, fontWeight: '800' }}
        >
          {profile.name}
        </Text>
      </View>
      <Text selectable style={{ color: theme.colors.accent, fontSize: 14, fontWeight: '800' }}>
        Change
      </Text>
      <AppIcon name="chevron-right" color={theme.colors.textMuted} size={20} />
    </Pressable>
  );
}
