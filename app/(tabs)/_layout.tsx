import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import React from 'react';

import { useAppTheme } from '@/theme/use-app-theme';

export default function TabsLayout(): React.ReactElement {
  const theme = useAppTheme();
  const [tabIcons, setTabIcons] = React.useState<{
    workouts: Awaited<ReturnType<typeof MaterialDesignIcons.getImageSource>>;
    bmi: Awaited<ReturnType<typeof MaterialDesignIcons.getImageSource>>;
    profiles: Awaited<ReturnType<typeof MaterialDesignIcons.getImageSource>>;
  }>();

  React.useEffect(() => {
    let mounted = true;
    void Promise.all([
      MaterialDesignIcons.getImageSource('weight-lifter', 24, '#FFFFFF'),
      MaterialDesignIcons.getImageSource('scale-bathroom', 24, '#FFFFFF'),
      MaterialDesignIcons.getImageSource('account-circle', 24, '#FFFFFF'),
    ]).then(([workouts, bmi, profiles]) => {
      if (mounted) setTabIcons({ workouts, bmi, profiles });
    });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <NativeTabs tintColor={theme.colors.accent} minimizeBehavior="onScrollDown">
      <NativeTabs.Trigger name="(workouts)">
        <NativeTabs.Trigger.Icon
          src={tabIcons?.workouts}
          renderingMode="template"
        />
        <NativeTabs.Trigger.Label>Workouts</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="bmi">
        <NativeTabs.Trigger.Icon
          src={tabIcons?.bmi}
          renderingMode="template"
        />
        <NativeTabs.Trigger.Label>BMI</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profiles">
        <NativeTabs.Trigger.Icon src={tabIcons?.profiles} renderingMode="template" />
        <NativeTabs.Trigger.Label>Profiles</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
