import SegmentedControl from '@react-native-segmented-control/segmented-control';
import React from 'react';
import { Text, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { FormField } from '@/components/form-field';
import { SheetScaffold } from '@/components/sheet-scaffold';
import { useAppTheme } from '@/theme/use-app-theme';
import { useResponsiveLayout } from '@/theme/use-responsive-layout';
import type { ExerciseType, SetInput, SetKind, WeightUnit } from '@/types/workout';
import { convertWeight, formatWeight, validateSetInput } from '@/utils/weight';

interface SetFormProps {
  exerciseType: ExerciseType;
  initialValue?: SetInput;
  submitLabel: string;
  submitting: boolean;
  onSubmit: (input: SetInput) => Promise<void>;
  secondaryAction?: { label: string; onPress: () => void; disabled?: boolean };
  heading?: string;
  description?: string;
}

interface FieldErrors {
  reps?: string;
  weight?: string;
  tut?: string;
  duration?: string;
  calories?: string;
}

function parseWholeNumber(value: string): number {
  return value.trim() === '' ? Number.NaN : Number(value);
}

export function SetForm({
  exerciseType,
  initialValue,
  submitLabel,
  submitting,
  onSubmit,
  secondaryAction,
  heading,
  description,
}: SetFormProps): React.ReactElement {
  const theme = useAppTheme();
  const { compact } = useResponsiveLayout();
  const initialStrength = initialValue?.kind === 'strength' ? initialValue : null;
  const [kind, setKind] = React.useState<Extract<SetKind, 'duration' | 'calories'>>(
    initialValue?.kind === 'calories' ? 'calories' : 'duration',
  );
  const [reps, setReps] = React.useState(String(initialStrength?.reps ?? 8));
  const [weight, setWeight] = React.useState(
    initialStrength?.inputWeight === null
      ? ''
      : String(initialStrength?.inputWeight ?? (exerciseType === 'body_weight' ? '' : 0)),
  );
  const [unit, setUnit] = React.useState<WeightUnit>(initialStrength?.inputUnit ?? 'kg');
  const [tut, setTut] = React.useState(String(initialStrength?.tutSeconds ?? 0));
  const initialDuration = initialValue?.kind === 'duration' ? initialValue.durationSeconds : 300;
  const [minutes, setMinutes] = React.useState(String(Math.floor(initialDuration / 60)));
  const [seconds, setSeconds] = React.useState(String(initialDuration % 60));
  const [calories, setCalories] = React.useState(
    initialValue?.kind === 'calories' ? String(initialValue.calories) : '',
  );
  const [errors, setErrors] = React.useState<FieldErrors>({});

  React.useEffect(() => {
    if (!initialValue) return;
    if (initialValue.kind === 'strength') {
      // Keep fields in sync when an asynchronously loaded set arrives.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setReps(String(initialValue.reps));
      setWeight(initialValue.inputWeight === null ? '' : String(initialValue.inputWeight));
      setUnit(initialValue.inputUnit);
      setTut(String(initialValue.tutSeconds));
    } else if (initialValue.kind === 'duration') {
      setKind('duration');
      setMinutes(String(Math.floor(initialValue.durationSeconds / 60)));
      setSeconds(String(initialValue.durationSeconds % 60));
    } else {
      setKind('calories');
      setCalories(String(initialValue.calories));
    }
  }, [initialValue]);

  const parsedWeight = weight.trim() === '' ? null : Number(weight);
  const conversion =
    parsedWeight !== null && Number.isFinite(parsedWeight) && parsedWeight >= 0
      ? convertWeight(parsedWeight, unit)
      : null;

  const save = async () => {
    let input: SetInput;
    const nextErrors: FieldErrors = {};
    if (exerciseType === 'cardio' && kind === 'duration') {
      const parsedMinutes = parseWholeNumber(minutes);
      const parsedSeconds = parseWholeNumber(seconds);
      if (!Number.isInteger(parsedMinutes) || parsedMinutes < 0)
        nextErrors.duration = 'Enter whole minutes of 0 or more.';
      else if (!Number.isInteger(parsedSeconds) || parsedSeconds < 0 || parsedSeconds > 59)
        nextErrors.duration = 'Enter seconds from 0 to 59.';
      input = { kind: 'duration', durationSeconds: parsedMinutes * 60 + parsedSeconds };
      if (!nextErrors.duration && input.durationSeconds < 1)
        nextErrors.duration = 'Duration must be at least one second.';
    } else if (exerciseType === 'cardio') {
      input = { kind: 'calories', calories: parseWholeNumber(calories) };
      if (!Number.isInteger(input.calories) || input.calories < 1)
        nextErrors.calories = 'Enter whole calories of 1 or more.';
    } else {
      input = {
        kind: 'strength',
        reps: parseWholeNumber(reps),
        inputWeight: parsedWeight,
        inputUnit: unit,
        tutSeconds: parseWholeNumber(tut),
      };
      if (!Number.isInteger(input.reps) || input.reps < 1)
        nextErrors.reps = 'Enter a whole number of 1 or more.';
      if (exerciseType !== 'body_weight' && input.inputWeight === null)
        nextErrors.weight = 'Enter a weight of 0 or more.';
      else if (
        input.inputWeight !== null &&
        (!Number.isFinite(input.inputWeight) || input.inputWeight < 0)
      )
        nextErrors.weight = 'Enter a weight of 0 or more.';
      if (!Number.isInteger(input.tutSeconds) || input.tutSeconds < 0)
        nextErrors.tut = 'Enter whole seconds of 0 or more.';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length || validateSetInput(input, exerciseType)) return;
    await onSubmit(input);
  };

  const strengthFields = (
    <>
      <FormField
        label="Repetitions"
        value={reps}
        onChangeText={setReps}
        keyboardType="number-pad"
        inputMode="numeric"
        returnKeyType="next"
        error={errors.reps}
        testID="set-reps"
      />
      <View style={{ gap: 9 }}>
        <Text selectable style={{ color: theme.colors.text, fontSize: 14, fontWeight: '700' }}>
          Weight unit
        </Text>
        <SegmentedControl
          accessibilityLabel="Weight unit"
          values={['Kilograms', 'Pounds']}
          selectedIndex={unit === 'kg' ? 0 : 1}
          onChange={(event) => setUnit(event.nativeEvent.selectedSegmentIndex === 0 ? 'kg' : 'lb')}
          tintColor={theme.colors.accentSoft}
          fontStyle={{ color: theme.colors.text, fontSize: compact ? 13 : 14 }}
          activeFontStyle={{
            color: theme.colors.text,
            fontSize: compact ? 13 : 14,
            fontWeight: '700',
          }}
          style={{ height: 44 }}
        />
      </View>
      <FormField
        label={`${exerciseType === 'body_weight' ? 'Added weight' : 'Weight'} (${unit})${exerciseType === 'body_weight' ? ' — optional' : ''}`}
        value={weight}
        onChangeText={setWeight}
        keyboardType="decimal-pad"
        inputMode="decimal"
        returnKeyType="next"
        placeholder={exerciseType === 'body_weight' ? 'No added weight' : undefined}
        error={errors.weight}
        testID="set-weight"
      />
      <View
        accessibilityLabel={
          conversion
            ? `${formatWeight(conversion.weightKg)} kilograms, ${formatWeight(conversion.weightLb)} pounds`
            : 'No added weight entered'
        }
        style={{
          flexDirection: 'row',
          borderRadius: 16,
          borderCurve: 'continuous',
          backgroundColor: theme.colors.surfaceMuted,
          padding: compact ? 12 : 14,
          gap: compact ? 8 : 12,
        }}
      >
        <View style={{ flex: 1, gap: 3 }}>
          <Text
            numberOfLines={1}
            style={{ color: theme.colors.textMuted, fontSize: 12, fontWeight: '700' }}
          >
            KILOGRAMS
          </Text>
          <Text
            style={{
              color: theme.colors.text,
              fontSize: 19,
              fontWeight: '800',
              fontVariant: ['tabular-nums'],
            }}
          >
            {conversion ? formatWeight(conversion.weightKg) : '—'}
          </Text>
        </View>
        <View style={{ width: 1, backgroundColor: theme.colors.border }} />
        <View style={{ flex: 1, gap: 3 }}>
          <Text
            numberOfLines={1}
            style={{ color: theme.colors.textMuted, fontSize: 12, fontWeight: '700' }}
          >
            POUNDS
          </Text>
          <Text
            style={{
              color: theme.colors.text,
              fontSize: 19,
              fontWeight: '800',
              fontVariant: ['tabular-nums'],
            }}
          >
            {conversion ? formatWeight(conversion.weightLb) : '—'}
          </Text>
        </View>
      </View>
      <FormField
        label="Time under tension (seconds)"
        value={tut}
        onChangeText={setTut}
        keyboardType="number-pad"
        inputMode="numeric"
        returnKeyType="done"
        onSubmitEditing={() => void save()}
        error={errors.tut}
        testID="set-tut"
      />
    </>
  );

  const cardioFields = (
    <>
      <View style={{ gap: 9 }}>
        <Text selectable style={{ color: theme.colors.text, fontSize: 14, fontWeight: '700' }}>
          Cardio metric
        </Text>
        <SegmentedControl
          accessibilityLabel="Cardio metric"
          values={['Duration', 'Calories']}
          selectedIndex={kind === 'duration' ? 0 : 1}
          onChange={(event) => {
            setKind(event.nativeEvent.selectedSegmentIndex === 0 ? 'duration' : 'calories');
            setErrors({});
          }}
          tintColor={theme.colors.accentSoft}
          style={{ height: 44 }}
        />
      </View>
      {kind === 'duration' ? (
        <View style={{ gap: 7 }}>
          <Text selectable style={{ color: theme.colors.text, fontSize: 14, fontWeight: '700' }}>
            Duration
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <FormField
                label="Minutes"
                value={minutes}
                onChangeText={setMinutes}
                keyboardType="number-pad"
                inputMode="numeric"
                returnKeyType="next"
                error={errors.duration}
                testID="set-duration-minutes"
              />
            </View>
            <View style={{ flex: 1 }}>
              <FormField
                label="Seconds"
                value={seconds}
                onChangeText={setSeconds}
                keyboardType="number-pad"
                inputMode="numeric"
                returnKeyType="done"
                onSubmitEditing={() => void save()}
                testID="set-duration-seconds"
              />
            </View>
          </View>
        </View>
      ) : (
        <FormField
          label="Calories (kcal)"
          value={calories}
          onChangeText={setCalories}
          keyboardType="number-pad"
          inputMode="numeric"
          returnKeyType="done"
          onSubmitEditing={() => void save()}
          error={errors.calories}
          testID="set-calories"
        />
      )}
    </>
  );

  return (
    <SheetScaffold
      testID="set-form"
      footer={
        <View style={{ gap: 10 }}>
          <AppButton
            label={submitLabel}
            loading={submitting}
            onPress={() => void save()}
            testID="save-set"
          />
          {secondaryAction ? (
            <AppButton
              label={secondaryAction.label}
              variant="secondary"
              onPress={secondaryAction.onPress}
              disabled={secondaryAction.disabled || submitting}
              testID="secondary-set-action"
            />
          ) : null}
        </View>
      }
    >
      <View style={{ gap: 5 }}>
        <Text selectable style={{ color: theme.colors.text, fontSize: 24, fontWeight: '800' }}>
          {heading ?? (exerciseType === 'cardio' ? 'Log your cardio set' : 'Log your working set')}
        </Text>
        <Text selectable style={{ color: theme.colors.textMuted, fontSize: 15, lineHeight: 21 }}>
          {description ??
            (exerciseType === 'cardio'
              ? 'Record either elapsed duration or calories burned.'
              : 'Record repetitions, load, and optional time under tension.')}
        </Text>
      </View>
      {exerciseType === 'cardio' ? cardioFields : strengthFields}
    </SheetScaffold>
  );
}
