import SegmentedControl from '@react-native-segmented-control/segmented-control';
import React from 'react';
import { Text, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { FormField } from '@/components/form-field';
import { SheetScaffold } from '@/components/sheet-scaffold';
import { useAppTheme } from '@/theme/use-app-theme';
import { useResponsiveLayout } from '@/theme/use-responsive-layout';
import type { SetInput, WeightUnit } from '@/types/workout';
import { convertWeight, formatWeight, validateSetInput } from '@/utils/weight';

interface SetFormProps {
  initialValue?: SetInput;
  submitLabel: string;
  submitting: boolean;
  onSubmit: (input: SetInput) => Promise<void>;
}

interface FieldErrors {
  reps?: string;
  weight?: string;
  tut?: string;
}

function parseWholeNumber(value: string): number {
  return value.trim() === '' ? Number.NaN : Number(value);
}

export function SetForm({
  initialValue = { reps: 8, inputWeight: 0, inputUnit: 'kg', tutSeconds: 0 },
  submitLabel,
  submitting,
  onSubmit,
}: SetFormProps): React.ReactElement {
  const theme = useAppTheme();
  const { compact } = useResponsiveLayout();
  const [reps, setReps] = React.useState(String(initialValue.reps));
  const [weight, setWeight] = React.useState(String(initialValue.inputWeight));
  const [unit, setUnit] = React.useState<WeightUnit>(initialValue.inputUnit);
  const [tut, setTut] = React.useState(String(initialValue.tutSeconds));
  const [errors, setErrors] = React.useState<FieldErrors>({});

  React.useEffect(() => {
    // Keep the editable fields in sync when an asynchronously loaded set arrives.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReps(String(initialValue.reps));
    setWeight(String(initialValue.inputWeight));
    setUnit(initialValue.inputUnit);
    setTut(String(initialValue.tutSeconds));
  }, [initialValue.inputUnit, initialValue.inputWeight, initialValue.reps, initialValue.tutSeconds]);

  const parsedWeight = Number(weight);
  const conversion = Number.isFinite(parsedWeight) && parsedWeight >= 0
    ? convertWeight(parsedWeight, unit)
    : null;

  const save = async () => {
    const input: SetInput = {
      reps: parseWholeNumber(reps),
      inputWeight: weight.trim() === '' ? Number.NaN : Number(weight),
      inputUnit: unit,
      tutSeconds: parseWholeNumber(tut),
    };
    const nextErrors: FieldErrors = {};
    if (!Number.isInteger(input.reps) || input.reps < 1) nextErrors.reps = 'Enter a whole number of 1 or more.';
    if (!Number.isFinite(input.inputWeight) || input.inputWeight < 0) nextErrors.weight = 'Enter a weight of 0 or more.';
    if (!Number.isInteger(input.tutSeconds) || input.tutSeconds < 0) nextErrors.tut = 'Enter whole seconds of 0 or more.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length || validateSetInput(input)) return;
    await onSubmit(input);
  };

  return (
    <SheetScaffold
      testID="set-form"
      footer={<AppButton label={submitLabel} loading={submitting} onPress={() => void save()} testID="save-set" />}
    >
      <View style={{ gap: 5 }}>
        <Text selectable style={{ color: theme.colors.text, fontSize: 24, fontWeight: '800' }}>
          Log your working set
        </Text>
        <Text selectable style={{ color: theme.colors.textMuted, fontSize: 15, lineHeight: 21 }}>
          Record repetitions, load, and optional time under tension.
        </Text>
      </View>

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
          activeFontStyle={{ color: theme.colors.text, fontSize: compact ? 13 : 14, fontWeight: '700' }}
          style={{ height: 44 }}
        />
      </View>

      <FormField
        label={`Weight (${unit})`}
        value={weight}
        onChangeText={setWeight}
        keyboardType="decimal-pad"
        inputMode="decimal"
        returnKeyType="next"
        error={errors.weight}
        testID="set-weight"
      />

      <View
        accessibilityLabel={conversion ? `${formatWeight(conversion.weightKg)} kilograms, ${formatWeight(conversion.weightLb)} pounds` : 'Enter a valid weight to see both units'}
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
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={{ color: theme.colors.textMuted, fontSize: 12, fontWeight: '700' }}>KILOGRAMS</Text>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} style={{ color: theme.colors.text, fontSize: 19, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
            {conversion ? formatWeight(conversion.weightKg) : '—'}
          </Text>
        </View>
        <View style={{ width: 1, backgroundColor: theme.colors.border }} />
        <View style={{ flex: 1, gap: 3 }}>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={{ color: theme.colors.textMuted, fontSize: 12, fontWeight: '700' }}>POUNDS</Text>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} style={{ color: theme.colors.text, fontSize: 19, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
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
    </SheetScaffold>
  );
}
