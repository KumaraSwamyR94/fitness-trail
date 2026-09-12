import { router } from 'expo-router';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { SwipeActionRow } from '@/components/swipe-action-row';
import { useAppTheme } from '@/theme/use-app-theme';
import type { BmiMeasurement } from '@/types/bmi';
import {
  BMI_CATEGORY_LABELS,
  classifyAdultBmi,
  formatBmi,
  formatHeight,
  GENDER_LABELS,
} from '@/utils/bmi';
import { formatWeight } from '@/utils/weight';

interface BmiMeasurementRowProps {
  measurement: BmiMeasurement;
  onDelete: () => void;
}

export function BmiMeasurementRow({
  measurement,
  onDelete,
}: BmiMeasurementRowProps): React.ReactElement {
  const theme = useAppTheme();
  const date = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(measurement.measuredAt));

  return (
    <SwipeActionRow onDelete={onDelete} deleteLabel={`Delete BMI measurement from ${date}`}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${date}, BMI ${formatBmi(measurement.bmi)}, ${formatWeight(measurement.inputWeight)} ${measurement.inputWeightUnit}`}
        onPress={() =>
          router.push({
            pathname: '/bmi/measurements/[measurementId]',
            params: { measurementId: measurement.id },
          })
        }
        testID={`bmi-history-${measurement.id}`}
        style={({ pressed }) => ({
          borderRadius: 18,
          borderCurve: 'continuous',
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
          padding: 15,
          gap: 9,
          opacity: pressed ? 0.76 : 1,
        })}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <Text selectable style={{ color: theme.colors.text, fontSize: 16, fontWeight: '800' }}>
              {date}
            </Text>
            <Text
              selectable
              style={{ color: theme.colors.textMuted, fontSize: 14, lineHeight: 20 }}
            >
              {formatWeight(measurement.inputWeight)} {measurement.inputWeightUnit} ·{' '}
              {formatHeight(measurement.heightCm, measurement.inputHeightUnit)}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 2 }}>
            <Text
              selectable
              style={{
                color: theme.colors.textMuted,
                fontSize: 11,
                fontWeight: '800',
                letterSpacing: 0.5,
              }}
            >
              BMI
            </Text>
            <Text
              selectable
              style={{
                color: theme.colors.accent,
                fontSize: 22,
                fontWeight: '900',
                fontVariant: ['tabular-nums'],
              }}
            >
              {formatBmi(measurement.bmi)}
            </Text>
          </View>
        </View>
        <Text selectable style={{ color: theme.colors.textMuted, fontSize: 13 }}>
          Age {measurement.ageYears} · {GENDER_LABELS[measurement.gender]} ·{' '}
          {BMI_CATEGORY_LABELS[classifyAdultBmi(measurement.bmi)]}
        </Text>
      </Pressable>
    </SwipeActionRow>
  );
}
