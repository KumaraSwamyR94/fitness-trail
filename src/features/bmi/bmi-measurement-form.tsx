import SegmentedControl from '@react-native-segmented-control/segmented-control';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { DateTimeField } from '@/components/date-time-field';
import { FormField } from '@/components/form-field';
import { SheetScaffold } from '@/components/sheet-scaffold';
import { useAppTheme } from '@/theme/use-app-theme';
import { useResponsiveLayout } from '@/theme/use-responsive-layout';
import type { BmiMeasurementInput, BmiValidationErrors, Gender, HeightUnit } from '@/types/bmi';
import type { WeightUnit } from '@/types/workout';
import {
  BMI_CATEGORY_LABELS,
  calculateBmi,
  centimetersToFeetInches,
  classifyAdultBmi,
  convertWeightValue,
  feetInchesToCentimeters,
  formatBmi,
  GENDER_LABELS,
  validateBmiMeasurementInput,
} from '@/utils/bmi';
import { convertWeight } from '@/utils/weight';

interface BmiMeasurementFormProps {
  initialValue?: BmiMeasurementInput;
  submitLabel: string;
  submitting: boolean;
  onSubmit: (input: BmiMeasurementInput) => Promise<void>;
}

const GENDERS = Object.keys(GENDER_LABELS) as Gender[];

function editableNumber(value: number, decimals = 2): string {
  return Number.isFinite(value) ? String(Number(value.toFixed(decimals))) : '';
}

function parseNumber(value: string): number {
  return value.trim() === '' ? Number.NaN : Number(value);
}

export function BmiMeasurementForm({
  initialValue,
  submitLabel,
  submitting,
  onSubmit,
}: BmiMeasurementFormProps): React.ReactElement {
  const theme = useAppTheme();
  const { compact } = useResponsiveLayout();
  const [measuredAt, setMeasuredAt] = React.useState(() => initialValue?.measuredAt ?? new Date());
  const [weightUnit, setWeightUnit] = React.useState<WeightUnit>(initialValue?.inputWeightUnit ?? 'kg');
  const [weight, setWeight] = React.useState(() => initialValue ? editableNumber(initialValue.inputWeight) : '');
  const [heightUnit, setHeightUnit] = React.useState<HeightUnit>(initialValue?.inputHeightUnit ?? 'cm');
  const [heightCm, setHeightCm] = React.useState(() => initialValue ? editableNumber(initialValue.heightCm) : '');
  const initialImperialHeight = centimetersToFeetInches(initialValue?.heightCm ?? 0);
  const [heightFeet, setHeightFeet] = React.useState(() => initialValue ? String(initialImperialHeight.feet) : '');
  const [heightInches, setHeightInches] = React.useState(() => initialValue ? editableNumber(initialImperialHeight.inches) : '');
  const [age, setAge] = React.useState(() => initialValue ? String(initialValue.ageYears) : '');
  const [gender, setGender] = React.useState<Gender | null>(initialValue?.gender ?? null);
  const [errors, setErrors] = React.useState<BmiValidationErrors>({});

  const parsedWeight = parseNumber(weight);
  const parsedHeightCm = heightUnit === 'cm'
    ? parseNumber(heightCm)
    : feetInchesToCentimeters(parseNumber(heightFeet), parseNumber(heightInches));
  const weightKg = Number.isFinite(parsedWeight) && parsedWeight > 0
    ? convertWeight(parsedWeight, weightUnit).weightKg
    : Number.NaN;
  const previewBmi = calculateBmi(weightKg, parsedHeightCm);
  const previewCategory = Number.isFinite(previewBmi) ? classifyAdultBmi(previewBmi) : null;

  const clearErrors = () => setErrors({});

  const changeWeightUnit = (nextUnit: WeightUnit) => {
    if (nextUnit === weightUnit) return;
    if (Number.isFinite(parsedWeight) && parsedWeight > 0) {
      setWeight(editableNumber(convertWeightValue(parsedWeight, weightUnit, nextUnit)));
    }
    setWeightUnit(nextUnit);
    clearErrors();
  };

  const changeHeightUnit = (nextUnit: HeightUnit) => {
    if (nextUnit === heightUnit) return;
    if (nextUnit === 'ft-in') {
      const converted = centimetersToFeetInches(parseNumber(heightCm));
      if (converted.feet > 0) {
        setHeightFeet(String(converted.feet));
        setHeightInches(editableNumber(converted.inches));
      }
    } else {
      const converted = feetInchesToCentimeters(parseNumber(heightFeet), parseNumber(heightInches));
      if (Number.isFinite(converted) && converted > 0) setHeightCm(editableNumber(converted));
    }
    setHeightUnit(nextUnit);
    clearErrors();
  };

  const save = async () => {
    const nextErrors: BmiValidationErrors = {};
    if (!gender) nextErrors.gender = 'Choose a gender option.';
    if (heightUnit === 'ft-in') {
      const feet = parseNumber(heightFeet);
      const inches = parseNumber(heightInches);
      if (!Number.isInteger(feet) || feet < 0 || !Number.isFinite(inches) || inches < 0 || inches >= 12) {
        nextErrors.height = 'Use whole feet and inches from 0 up to 11.99.';
      }
    }
    const input: BmiMeasurementInput = {
      measuredAt,
      inputWeight: parsedWeight,
      inputWeightUnit: weightUnit,
      inputHeightUnit: heightUnit,
      heightCm: parsedHeightCm,
      ageYears: parseNumber(age),
      gender: gender ?? 'prefer_not_to_say',
    };
    Object.assign(nextErrors, validateBmiMeasurementInput(input));
    if (!gender) nextErrors.gender = 'Choose a gender option.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    await onSubmit(input);
  };

  return (
    <SheetScaffold
      testID="bmi-measurement-form"
      footer={<AppButton label={submitLabel} loading={submitting} onPress={() => void save()} testID="save-bmi-measurement" />}
    >
      <Text selectable style={{ color: theme.colors.textMuted, fontSize: 15, lineHeight: 21 }}>
        Record a point in your body-weight history. BMI is a screening measure, not a medical diagnosis.
      </Text>

      <DateTimeField
        label="Measurement date and time"
        value={measuredAt}
        maximumDate={new Date()}
        error={errors.measuredAt}
        onChange={(value) => {
          setMeasuredAt(value);
          clearErrors();
        }}
      />

      <View style={{ gap: 9 }}>
        <Text selectable style={{ color: theme.colors.text, fontSize: 14, fontWeight: '700' }}>Weight unit</Text>
        <SegmentedControl
          accessibilityLabel="Weight unit"
          values={['Kilograms', 'Pounds']}
          selectedIndex={weightUnit === 'kg' ? 0 : 1}
          onChange={(event) => changeWeightUnit(event.nativeEvent.selectedSegmentIndex === 0 ? 'kg' : 'lb')}
          style={{ height: 44 }}
        />
      </View>

      <FormField
        label={`Weight (${weightUnit})`}
        value={weight}
        onChangeText={(value) => {
          setWeight(value);
          clearErrors();
        }}
        keyboardType="decimal-pad"
        inputMode="decimal"
        returnKeyType="next"
        error={errors.weight}
        testID="bmi-weight"
      />

      <View style={{ gap: 9 }}>
        <Text selectable style={{ color: theme.colors.text, fontSize: 14, fontWeight: '700' }}>Height unit</Text>
        <SegmentedControl
          accessibilityLabel="Height unit"
          values={['Centimetres', 'Feet & inches']}
          selectedIndex={heightUnit === 'cm' ? 0 : 1}
          onChange={(event) => changeHeightUnit(event.nativeEvent.selectedSegmentIndex === 0 ? 'cm' : 'ft-in')}
          style={{ height: 44 }}
        />
      </View>

      {heightUnit === 'cm' ? (
        <FormField
          label="Height (cm)"
          value={heightCm}
          onChangeText={(value) => {
            setHeightCm(value);
            clearErrors();
          }}
          keyboardType="decimal-pad"
          inputMode="decimal"
          returnKeyType="next"
          error={errors.height}
          testID="bmi-height-cm"
        />
      ) : (
        <View style={{ gap: 7 }}>
          <View style={{ flexDirection: compact ? 'column' : 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <FormField
                label="Height (feet)"
                value={heightFeet}
                onChangeText={(value) => {
                  setHeightFeet(value);
                  clearErrors();
                }}
                keyboardType="number-pad"
                inputMode="numeric"
                returnKeyType="next"
                testID="bmi-height-feet"
              />
            </View>
            <View style={{ flex: 1 }}>
              <FormField
                label="Height (inches)"
                value={heightInches}
                onChangeText={(value) => {
                  setHeightInches(value);
                  clearErrors();
                }}
                keyboardType="decimal-pad"
                inputMode="decimal"
                returnKeyType="next"
                testID="bmi-height-inches"
              />
            </View>
          </View>
          {errors.height ? (
            <Text selectable accessibilityLiveRegion="polite" style={{ color: theme.colors.danger, fontSize: 13 }}>
              {errors.height}
            </Text>
          ) : null}
        </View>
      )}

      <FormField
        label="Age"
        value={age}
        onChangeText={(value) => {
          setAge(value);
          clearErrors();
        }}
        keyboardType="number-pad"
        inputMode="numeric"
        returnKeyType="done"
        error={errors.age}
        testID="bmi-age"
      />

      <View style={{ gap: 9 }}>
        <Text selectable style={{ color: theme.colors.text, fontSize: 14, fontWeight: '700' }}>Gender</Text>
        <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {GENDERS.map((option) => {
            const selected = gender === option;
            return (
              <Pressable
                key={option}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={GENDER_LABELS[option]}
                onPress={() => {
                  setGender(option);
                  clearErrors();
                }}
                testID={`bmi-gender-${option}`}
                style={({ pressed }) => ({
                  minHeight: 42,
                  justifyContent: 'center',
                  borderRadius: 14,
                  borderCurve: 'continuous',
                  borderWidth: 1,
                  borderColor: selected ? theme.colors.accent : theme.colors.border,
                  backgroundColor: selected ? theme.colors.accentSoft : theme.colors.surface,
                  paddingHorizontal: 13,
                  opacity: pressed ? 0.78 : 1,
                })}
              >
                <Text selectable style={{ color: selected ? theme.colors.accent : theme.colors.text, fontWeight: '700' }}>
                  {GENDER_LABELS[option]}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {errors.gender ? (
          <Text selectable accessibilityLiveRegion="polite" style={{ color: theme.colors.danger, fontSize: 13 }}>
            {errors.gender}
          </Text>
        ) : null}
      </View>

      <View
        accessibilityLabel={previewCategory ? `BMI preview ${formatBmi(previewBmi)}, ${BMI_CATEGORY_LABELS[previewCategory]}` : 'Enter a valid weight and height to preview BMI'}
        style={{
          borderRadius: 18,
          borderCurve: 'continuous',
          backgroundColor: theme.colors.surfaceMuted,
          padding: 16,
          gap: 4,
        }}
      >
        <Text selectable style={{ color: theme.colors.textMuted, fontSize: 12, fontWeight: '800', letterSpacing: 0.6 }}>
          BMI PREVIEW
        </Text>
        <Text selectable style={{ color: theme.colors.text, fontSize: 30, fontWeight: '900', fontVariant: ['tabular-nums'] }}>
          {formatBmi(previewBmi)}
        </Text>
        <Text selectable style={{ color: theme.colors.textMuted, fontSize: 14 }}>
          {previewCategory ? BMI_CATEGORY_LABELS[previewCategory] : 'Enter weight and height'}
        </Text>
      </View>

      <Text selectable style={{ color: theme.colors.textMuted, fontSize: 13, lineHeight: 19 }}>
        Adult BMI categories use height and weight only. Age and gender are saved as context and do not change the calculation.
      </Text>
    </SheetScaffold>
  );
}
