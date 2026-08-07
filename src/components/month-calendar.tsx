import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

import { AppIcon } from '@/components/app-icon';
import { useAppTheme } from '@/theme/use-app-theme';
import { useResponsiveLayout } from '@/theme/use-responsive-layout';
import { buildMonthWeeks, getFirstWeekday, getWeekdayLabels } from '@/utils/dates';

interface MonthCalendarProps {
  month: Date;
  selectedKey: string;
  markedKeys: ReadonlySet<string>;
  onSelect: (key: string) => void;
  onPrevious: () => void;
  onNext: () => void;
}

export function MonthCalendar({
  month,
  selectedKey,
  markedKeys,
  onSelect,
  onPrevious,
  onNext,
}: MonthCalendarProps): React.ReactElement {
  const theme = useAppTheme();
  const { compact } = useResponsiveLayout();
  const locale = Intl.DateTimeFormat().resolvedOptions().locale;
  const firstWeekday = getFirstWeekday(locale);
  const labels = getWeekdayLabels(locale, firstWeekday);
  const weeks = buildMonthWeeks(month, firstWeekday);
  const title = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(month);
  const swipe = React.useMemo(
    () =>
      Gesture.Pan().onEnd(({ translationX, velocityX }) => {
        if (translationX < -55 || velocityX < -500) runOnJS(onNext)();
        if (translationX > 55 || velocityX > 500) runOnJS(onPrevious)();
      }),
    [onNext, onPrevious],
  );

  return (
    <GestureDetector gesture={swipe}>
      <View
        style={{
          backgroundColor: theme.colors.surface,
          borderRadius: compact ? 20 : 24,
          borderCurve: 'continuous',
          padding: compact ? 10 : 14,
          gap: compact ? 8 : 10,
          boxShadow: theme.dark
            ? '0 8px 24px rgba(0, 0, 0, 0.24)'
            : '0 8px 24px rgba(37, 55, 80, 0.08)',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            onPress={onPrevious}
            hitSlop={10}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <AppIcon name="chevron-left" color={theme.colors.text} size={22} />
          </Pressable>
          <Text
            selectable
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.72}
            style={{ flex: 1, minWidth: 0, textAlign: 'center', color: theme.colors.text, fontSize: 18, fontWeight: '800' }}
          >
            {title}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next month"
            onPress={onNext}
            hitSlop={10}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <AppIcon name="chevron-right" color={theme.colors.text} size={22} />
          </Pressable>
        </View>
        <View style={{ flexDirection: 'row' }}>
          {labels.map((label, index) => (
            <View key={`${label}-${index}`} style={{ flex: 1, minWidth: 0, alignItems: 'center' }}>
              <Text
                numberOfLines={1}
                style={{ textAlign: 'center', color: theme.colors.textMuted, fontSize: 12, fontWeight: '700' }}
              >
                {label}
              </Text>
            </View>
          ))}
        </View>
        <View>
          {weeks.map((week) => (
            <View key={week[0].key} style={{ flexDirection: 'row' }}>
              {week.map((day) => {
                const selected = day.key === selectedKey;
                const marked = markedKeys.has(day.key);
                const label = new Intl.DateTimeFormat(locale, { dateStyle: 'full' }).format(day.date);
                return (
                  <Pressable
                    key={day.key}
                    accessibilityRole="button"
                    accessibilityLabel={`${label}${marked ? ', workout logged' : ''}`}
                    accessibilityState={{ selected }}
                    onPress={() => onSelect(day.key)}
                    style={({ pressed }) => ({
                      flex: 1,
                      minWidth: 0,
                      minHeight: 44,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: compact ? 12 : 14,
                      borderCurve: 'continuous',
                      backgroundColor: selected ? theme.colors.accent : pressed ? theme.colors.surfaceMuted : 'transparent',
                    })}
                  >
                    <Text
                      numberOfLines={1}
                      style={{
                        color: selected
                          ? '#FFFFFF'
                          : day.isCurrentMonth
                            ? theme.colors.text
                            : theme.colors.textMuted,
                        opacity: day.isCurrentMonth || selected ? 1 : 0.42,
                        fontWeight: selected || marked ? '800' : '500',
                        fontVariant: ['tabular-nums'],
                      }}
                    >
                      {day.date.getDate()}
                    </Text>
                    <View
                      style={{
                        width: 4,
                        height: 4,
                        borderRadius: 2,
                        backgroundColor: marked
                          ? selected
                            ? '#FFFFFF'
                            : theme.colors.accent
                          : 'transparent',
                      }}
                    />
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </View>
    </GestureDetector>
  );
}
