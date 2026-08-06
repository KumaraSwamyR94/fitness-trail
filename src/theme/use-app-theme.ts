import { useColorScheme } from 'react-native';

export interface AppTheme {
  dark: boolean;
  colors: {
    background: string;
    surface: string;
    surfaceMuted: string;
    text: string;
    textMuted: string;
    accent: string;
    accentSoft: string;
    border: string;
    danger: string;
    dangerSoft: string;
    success: string;
  };
}

export function useAppTheme(): AppTheme {
  const dark = useColorScheme() === 'dark';
  return {
    dark,
    colors: dark
      ? {
          background: '#08111F',
          surface: '#101C2E',
          surfaceMuted: '#17263A',
          text: '#F8FAFC',
          textMuted: '#9FB0C6',
          accent: '#5EA2FF',
          accentSoft: '#173A66',
          border: '#263B55',
          danger: '#FF6B6B',
          dangerSoft: '#4A2029',
          success: '#5DD6A6',
        }
      : {
          background: '#F5F7FB',
          surface: '#FFFFFF',
          surfaceMuted: '#EEF2F7',
          text: '#132033',
          textMuted: '#64748B',
          accent: '#2563EB',
          accentSoft: '#DBEAFE',
          border: '#DFE6EF',
          danger: '#DC2626',
          dangerSoft: '#FEE2E2',
          success: '#059669',
        },
  };
}
