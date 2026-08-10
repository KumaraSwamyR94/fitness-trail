import { Image } from 'expo-image';
import React from 'react';
import { Text, View } from 'react-native';

import { useAppTheme } from '@/theme/use-app-theme';
import type { ProfilePhoto } from '@/types/profile';
import { profilePhotoUri } from '@/utils/profile-media';

function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}

export function ProfileAvatar({
  name,
  photo,
  size = 56,
}: {
  name: string;
  photo: ProfilePhoto;
  size?: number;
}): React.ReactElement {
  const theme = useAppTheme();
  const uri = profilePhotoUri(photo);
  const style = {
    width: size,
    height: size,
    borderRadius: size / 2,
    borderCurve: 'continuous' as const,
    backgroundColor: theme.colors.accentSoft,
  };

  if (uri) {
    return (
      <Image
        source={{ uri }}
        contentFit="cover"
        transition={120}
        style={style}
        accessibilityLabel={`${name} profile picture`}
      />
    );
  }

  return (
    <View
      accessibilityLabel={`${name} initials`}
      style={{ ...style, alignItems: 'center', justifyContent: 'center' }}
    >
      <Text
        selectable
        style={{
          color: theme.colors.accent,
          fontSize: Math.max(16, size * 0.34),
          fontWeight: '900',
        }}
      >
        {initials(name)}
      </Text>
    </View>
  );
}
