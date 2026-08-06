import { Image } from 'expo-image';
import { Text } from 'react-native';

interface SymbolIconProps {
  name: string;
  fallback: string;
  color: string;
  size?: number;
}

export function SymbolIcon({ name, fallback, color, size = 20 }: SymbolIconProps) {
  if (process.env.EXPO_OS === 'ios') {
    return (
      <Image
        source={`sf:${name}`}
        style={{ width: size, height: size }}
        tintColor={color}
        contentFit="contain"
      />
    );
  }
  return <Text style={{ color, fontSize: size, lineHeight: size + 2 }}>{fallback}</Text>;
}
