import React from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeIn, LinearTransition, useReducedMotion } from 'react-native-reanimated';

import { SwipeActionRow } from '@/components/swipe-action-row';
import { useAppTheme } from '@/theme/use-app-theme';
import { useResponsiveLayout } from '@/theme/use-responsive-layout';
import type { ExerciseType, WorkoutSet } from '@/types/workout';
import { formatWeight } from '@/utils/weight';
import { formatDuration } from '@/utils/workout';

const strengthColumns = [
  { label: 'SET', flex: 0.62 },
  { label: 'REPS', flex: 0.85 },
  { label: 'KG', flex: 1.15 },
  { label: 'LB', flex: 1.15 },
  { label: 'TUT', flex: 0.9 },
] as const;

const cardioColumns = [
  { label: 'SET', flex: 0.7 },
  { label: 'METRIC', flex: 1.3 },
  { label: 'VALUE', flex: 1.6 },
] as const;

interface WorkoutSetGridProps {
  sets: WorkoutSet[];
  exerciseType: ExerciseType;
  readOnly?: boolean;
  onDelete?: (workoutSet: WorkoutSet) => void;
  onEdit?: (workoutSet: WorkoutSet) => void;
}

function SetGridHeader({ cardio }: { cardio: boolean }): React.ReactElement {
  const theme = useAppTheme();
  const { compact } = useResponsiveLayout();
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      style={{
        flexDirection: 'row',
        paddingHorizontal: compact ? 8 : 14,
        paddingVertical: 9,
        gap: compact ? 2 : 4,
      }}
    >
      {(cardio ? cardioColumns : strengthColumns).map(({ label, flex }) => (
        <Text
          key={label}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.72}
          style={{
            flex,
            minWidth: 0,
            color: theme.colors.textMuted,
            fontSize: 11,
            fontWeight: '800',
            textAlign: 'center',
          }}
        >
          {label}
        </Text>
      ))}
    </View>
  );
}

function getSetPresentation(workoutSet: WorkoutSet): {
  summary: string;
  cells: [string, number][];
} {
  if (workoutSet.kind === 'duration') {
    return {
      summary: `Set ${workoutSet.position + 1}, duration ${formatDuration(workoutSet.durationSeconds)}`,
      cells: [
        [String(workoutSet.position + 1), cardioColumns[0].flex],
        ['Duration', cardioColumns[1].flex],
        [formatDuration(workoutSet.durationSeconds), cardioColumns[2].flex],
      ],
    };
  }
  if (workoutSet.kind === 'calories') {
    return {
      summary: `Set ${workoutSet.position + 1}, ${workoutSet.calories} calories`,
      cells: [
        [String(workoutSet.position + 1), cardioColumns[0].flex],
        ['Calories', cardioColumns[1].flex],
        [`${workoutSet.calories} kcal`, cardioColumns[2].flex],
      ],
    };
  }
  return {
    summary: `Set ${workoutSet.position + 1}, ${workoutSet.reps} repetitions, ${workoutSet.inputWeight === null ? 'no added weight' : `${formatWeight(workoutSet.weightKg ?? 0)} kilograms, ${formatWeight(workoutSet.weightLb ?? 0)} pounds`}, ${workoutSet.tutSeconds} seconds time under tension`,
    cells: [
      [String(workoutSet.position + 1), strengthColumns[0].flex],
      [String(workoutSet.reps), strengthColumns[1].flex],
      [
        workoutSet.weightKg === null ? '—' : formatWeight(workoutSet.weightKg),
        strengthColumns[2].flex,
      ],
      [
        workoutSet.weightLb === null ? '—' : formatWeight(workoutSet.weightLb),
        strengthColumns[3].flex,
      ],
      [`${workoutSet.tutSeconds}s`, strengthColumns[4].flex],
    ],
  };
}

function SetCells({ workoutSet }: { workoutSet: WorkoutSet }): React.ReactElement {
  const theme = useAppTheme();
  const { compact } = useResponsiveLayout();
  const { cells } = getSetPresentation(workoutSet);
  return (
    <>
      {cells.map(([value, flex], index) => (
        <Text
          selectable
          key={`${value}-${index}`}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.72}
          style={{
            flex,
            minWidth: 0,
            textAlign: 'center',
            color: theme.colors.text,
            fontSize: compact ? 14 : 15,
            fontWeight: index === 0 ? '800' : '600',
            fontVariant: ['tabular-nums'],
          }}
        >
          {value}
        </Text>
      ))}
    </>
  );
}

function SetRow({
  workoutSet,
  readOnly,
  onDelete,
  onEdit,
}: {
  workoutSet: WorkoutSet;
  readOnly: boolean;
  onDelete?: () => void;
  onEdit?: () => void;
}): React.ReactElement {
  const theme = useAppTheme();
  const { compact } = useResponsiveLayout();
  const { summary } = getSetPresentation(workoutSet);
  const rowStyle = {
    minHeight: 58,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: compact ? 2 : 4,
    paddingHorizontal: compact ? 8 : 14,
    backgroundColor: readOnly ? 'transparent' : theme.colors.surface,
    borderWidth: readOnly ? 0 : 1,
    borderColor: theme.colors.border,
    borderRadius: readOnly ? 0 : 16,
    borderCurve: 'continuous' as const,
  };

  if (readOnly) {
    return (
      <View accessible accessibilityLabel={summary} style={rowStyle} testID="historical-set-row">
        <SetCells workoutSet={workoutSet} />
      </View>
    );
  }

  return (
    <SwipeActionRow
      onDelete={() => onDelete?.()}
      deleteLabel={`Delete set ${workoutSet.position + 1}`}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={summary}
        accessibilityHint="Opens this set for editing."
        onPress={onEdit}
        style={({ pressed }) => ({ ...rowStyle, opacity: pressed ? 0.72 : 1 })}
        testID="current-set-row"
      >
        <SetCells workoutSet={workoutSet} />
      </Pressable>
    </SwipeActionRow>
  );
}

export function WorkoutSetGrid({
  sets,
  exerciseType,
  readOnly = false,
  onDelete,
  onEdit,
}: WorkoutSetGridProps): React.ReactElement | null {
  const theme = useAppTheme();
  const reduceMotion = useReducedMotion();
  if (!sets.length) return null;
  return (
    <View style={{ gap: readOnly ? 0 : 8 }}>
      <SetGridHeader cardio={exerciseType === 'cardio'} />
      {sets.map((workoutSet, index) => (
        <Animated.View
          key={workoutSet.id}
          entering={reduceMotion ? undefined : FadeIn.duration(160)}
          layout={readOnly || reduceMotion ? undefined : LinearTransition.duration(180)}
          style={
            readOnly && index > 0
              ? { borderTopWidth: 1, borderTopColor: theme.colors.border }
              : undefined
          }
        >
          <SetRow
            workoutSet={workoutSet}
            readOnly={readOnly}
            onDelete={() => onDelete?.(workoutSet)}
            onEdit={() => onEdit?.(workoutSet)}
          />
        </Animated.View>
      ))}
    </View>
  );
}
