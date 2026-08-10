import SegmentedControl from '@react-native-segmented-control/segmented-control';
import React from 'react';
import { Text, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { DateTimeField } from '@/components/date-time-field';
import { FormField } from '@/components/form-field';
import { ProfileAvatar } from '@/components/profile-avatar';
import { SheetScaffold } from '@/components/sheet-scaffold';
import { useAppTheme } from '@/theme/use-app-theme';
import type {
  BmiMeasurement,
  BmiMeasurementDraft,
  BmiMeasurementInput,
  BmiValidationErrors,
} from '@/types/bmi';
import type { Profile } from '@/types/profile';
import type { WeightUnit } from '@/types/workout';
import {
  BMI_CATEGORY_LABELS,
  calculateBmi,
  classifyAdultBmi,
  convertWeightValue,
  formatBmi,
  formatHeight,
  GENDER_LABELS,
  validateBmiMeasurementInput,
} from '@/utils/bmi';
import { profileAgeOnDate } from '@/utils/profiles';
import { convertWeight } from '@/utils/weight';

interface BmiMeasurementFormProps {
  profile: Profile;
  snapshot?: BmiMeasurement;
  initialValue?: BmiMeasurementDraft;
  submitLabel: string;
  submitting: boolean;
  onSubmit: (input: BmiMeasurementDraft) => Promise<void>;
}

function editableNumber(value: number, decimals = 2): string {
  return Number.isFinite(value) ? String(Number(value.toFixed(decimals))) : '';
}

function parseNumber(value: string): number {
  return value.trim() === '' ? Number.NaN : Number(value);
}

export function BmiMeasurementForm({
  profile,
  snapshot,
  initialValue,
  submitLabel,
  submitting,
  onSubmit,
}: BmiMeasurementFormProps): React.ReactElement {
  const theme = useAppTheme();
  const [measuredAt, setMeasuredAt] = React.useState(() => initialValue?.measuredAt ?? new Date());
  const [weightUnit, setWeightUnit] = React.useState<WeightUnit>(
    initialValue?.inputWeightUnit ?? 'kg',
  );
  const [weight, setWeight] = React.useState(() =>
    initialValue ? editableNumber(initialValue.inputWeight) : '',
  );
  const [errors, setErrors] = React.useState<BmiValidationErrors>({});

  const parsedWeight = parseNumber(weight);
  const heightCm = snapshot?.heightCm ?? profile.heightCm;
  const heightUnit = snapshot?.inputHeightUnit ?? profile.inputHeightUnit;
  const ageYears = snapshot?.ageYears ?? profileAgeOnDate(profile, measuredAt);
  const gender = snapshot?.gender ?? profile.gender;
  const weightKg =
    Number.isFinite(parsedWeight) && parsedWeight > 0
      ? convertWeight(parsedWeight, weightUnit).weightKg
      : Number.NaN;
  const previewBmi = calculateBmi(weightKg, heightCm);
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

  const save = async () => {
    const draft: BmiMeasurementDraft = {
      measuredAt,
      inputWeight: parsedWeight,
      inputWeightUnit: weightUnit,
    };
    const validationInput: BmiMeasurementInput = {
      ...draft,
      inputHeightUnit: heightUnit,
      heightCm,
      ageYears,
      gender,
    };
    const nextErrors = validateBmiMeasurementInput(validationInput);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    await onSubmit(draft);
  };

  return (
    <SheetScaffold
      testID="bmi-measurement-form"
      footer={
        <AppButton
          label={submitLabel}
          loading={submitting}
          onPress={() => void save()}
          testID="save-bmi-measurement"
        />
      }
    >
      <Text selectable style={{ color: theme.colors.textMuted, fontSize: 15, lineHeight: 21 }}>
        Record a point in {profile.name}’s body-weight history. BMI is a screening measure, not a
        medical diagnosis.
      </Text>

      <View
        style={{
          borderRadius: 18,
          borderCurve: 'continuous',
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
          padding: 14,
          gap: 12,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <ProfileAvatar name={profile.name} photo={profile.photo} size={50} />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text
              selectable
              style={{
                color: theme.colors.textMuted,
                fontSize: 11,
                fontWeight: '800',
                letterSpacing: 0.5,
              }}
            >
              {snapshot ? 'SAVED PROFILE SNAPSHOT' : 'FROM SELECTED PROFILE'}
            </Text>
            <Text
              selectable
              numberOfLines={1}
              style={{ color: theme.colors.text, fontSize: 17, fontWeight: '800' }}
            >
              {profile.name}
            </Text>
          </View>
        </View>
        <View style={{ height: 1, backgroundColor: theme.colors.border }} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {[
            ['AGE', `${ageYears}`],
            ['GENDER', GENDER_LABELS[gender]],
            ['HEIGHT', formatHeight(heightCm, heightUnit)],
          ].map(([label, value]) => (
            <View
              key={label}
              style={{
                flex: 1,
                minWidth: 88,
                gap: 3,
                borderRadius: 13,
                borderCurve: 'continuous',
                backgroundColor: theme.colors.surfaceMuted,
                padding: 10,
              }}
            >
              <Text
                selectable
                style={{ color: theme.colors.textMuted, fontSize: 10, fontWeight: '800' }}
              >
                {label}
              </Text>
              <Text
                selectable
                numberOfLines={1}
                adjustsFontSizeToFit
                style={{
                  color: theme.colors.text,
                  fontSize: 14,
                  fontWeight: '800',
                  fontVariant: ['tabular-nums'],
                }}
              >
                {value}
              </Text>
            </View>
          ))}
        </View>
        <Text selectable style={{ color: theme.colors.textMuted, fontSize: 12, lineHeight: 17 }}>
          Edit these details from the Profiles tab. Existing measurements keep their saved values.
        </Text>
        {errors.age ? (
          <Text
            selectable
            accessibilityLiveRegion="polite"
            style={{ color: theme.colors.danger, fontSize: 13 }}
          >
            {errors.age}
          </Text>
        ) : null}
      </View>

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
        <Text selectable style={{ color: theme.colors.text, fontSize: 14, fontWeight: '700' }}>
          Weight unit
        </Text>
        <SegmentedControl
          accessibilityLabel="Weight unit"
          values={['Kilograms', 'Pounds']}
          selectedIndex={weightUnit === 'kg' ? 0 : 1}
          onChange={(event) =>
            changeWeightUnit(event.nativeEvent.selectedSegmentIndex === 0 ? 'kg' : 'lb')
          }
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
        returnKeyType="done"
        error={errors.weight}
        testID="bmi-weight"
      />

      <View
        accessibilityLabel={
          previewCategory
            ? `BMI preview ${formatBmi(previewBmi)}, ${BMI_CATEGORY_LABELS[previewCategory]}`
            : 'Enter a valid weight to preview BMI'
        }
        style={{
          borderRadius: 18,
          borderCurve: 'continuous',
          backgroundColor: theme.colors.surfaceMuted,
          padding: 16,
          gap: 4,
        }}
      >
        <Text
          selectable
          style={{
            color: theme.colors.textMuted,
            fontSize: 12,
            fontWeight: '800',
            letterSpacing: 0.6,
          }}
        >
          BMI PREVIEW
        </Text>
        <Text
          selectable
          style={{
            color: theme.colors.text,
            fontSize: 30,
            fontWeight: '900',
            fontVariant: ['tabular-nums'],
          }}
        >
          {formatBmi(previewBmi)}
        </Text>
        <Text selectable style={{ color: theme.colors.textMuted, fontSize: 14 }}>
          {previewCategory ? BMI_CATEGORY_LABELS[previewCategory] : 'Enter weight'}
        </Text>
      </View>
    </SheetScaffold>
  );
}
