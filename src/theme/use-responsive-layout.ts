import { useWindowDimensions } from 'react-native';

export const readableContentMaxWidth = 720;
export const formContentMaxWidth = 600;

export interface ResponsiveLayout {
  compact: boolean;
  horizontalPadding: number;
}

export function useResponsiveLayout(): ResponsiveLayout {
  const { width } = useWindowDimensions();
  const compact = width < 380;

  return {
    compact,
    horizontalPadding: compact ? 12 : 18,
  };
}
