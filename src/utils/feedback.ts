import * as Haptics from 'expo-haptics';

export function successFeedback(): void {
  if (process.env.EXPO_OS === 'web') return;
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
}

export function selectionFeedback(): void {
  if (process.env.EXPO_OS === 'web') return;
  void Haptics.selectionAsync().catch(() => undefined);
}

export function warningFeedback(): void {
  if (process.env.EXPO_OS === 'web') return;
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
}
