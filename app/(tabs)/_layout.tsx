import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { useAppTheme } from '@/theme/use-app-theme';

export default function TabsLayout(): React.ReactElement {
  const theme = useAppTheme();
  return (
    <NativeTabs tintColor={theme.colors.accent} minimizeBehavior="onScrollDown">
      <NativeTabs.Trigger name="(workouts)">
        <NativeTabs.Trigger.Icon
          sf={{ default: 'figure.strengthtraining.traditional', selected: 'figure.strengthtraining.traditional' }}
          md="fitness_center"
        />
        <NativeTabs.Trigger.Label>Workouts</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="bmi">
        <NativeTabs.Trigger.Icon sf={{ default: 'scalemass', selected: 'scalemass.fill' }} md="monitor_weight" />
        <NativeTabs.Trigger.Label>BMI</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
