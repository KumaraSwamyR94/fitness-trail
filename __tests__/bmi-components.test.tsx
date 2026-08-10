import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { BmiTrendChart } from '@/components/bmi-trend-chart';
import { BmiMeasurementForm } from '@/features/bmi/bmi-measurement-form';
import type { BmiMeasurement, BmiMeasurementDraft } from '@/types/bmi';
import type { Profile } from '@/types/profile';
import { calculateBmi } from '@/utils/bmi';

jest.mock('expo-image', () => ({ Image: () => null }));

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const profile: Profile = {
  id: 'p1',
  name: 'Alex Trail',
  ageSource: 'age',
  ageYears: 30,
  dateOfBirth: null,
  gender: 'woman',
  inputHeightUnit: 'cm',
  heightCm: 175,
  photo: { kind: 'none', ref: null },
  createdAt: 1,
  updatedAt: 1,
};

const initialValue: BmiMeasurementDraft = {
  measuredAt: new Date(Date.now() - 60_000),
  inputWeight: 70,
  inputWeightUnit: 'kg',
};

async function renderForm(onSubmit = jest.fn(async () => undefined), value?: BmiMeasurementDraft) {
  return {
    onSubmit,
    ...(await render(
      <SafeAreaProvider initialMetrics={initialMetrics}>
        <BmiMeasurementForm
          profile={profile}
          initialValue={value}
          submitLabel="Save"
          submitting={false}
          onSubmit={onSubmit}
        />
      </SafeAreaProvider>,
    )),
  };
}

describe('BMI measurement form', () => {
  test('shows required validation before submitting an empty measurement', async () => {
    const { getByTestId, findByText, onSubmit } = await renderForm();
    await fireEvent.press(getByTestId('save-bmi-measurement'));
    expect(await findByText('Enter a weight greater than 0.')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('converts populated values when unit controls change', async () => {
    const { getByLabelText, getByTestId, queryByTestId, getByText } = await renderForm(
      undefined,
      initialValue,
    );
    await fireEvent(getByLabelText('Weight unit'), 'onChange', {
      nativeEvent: { selectedSegmentIndex: 1 },
    });
    await waitFor(() => expect(getByTestId('bmi-weight').props.value).toBe('154.32'));
    expect(queryByTestId('bmi-age')).toBeNull();
    expect(getByText('175.0 cm')).toBeTruthy();
  });

  test('submits a complete prefilled measurement', async () => {
    const onSubmit = jest.fn(async () => undefined);
    const { getByTestId } = await renderForm(onSubmit, initialValue);
    await fireEvent.press(getByTestId('save-bmi-measurement'));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          inputWeight: 70,
          inputWeightUnit: 'kg',
        }),
      ),
    );
  });
});

describe('BMI trend chart', () => {
  const measurement: BmiMeasurement = {
    id: 'b1',
    profileId: 'p1',
    measuredAt: Date.now(),
    localDate: '2026-08-06',
    timezoneOffsetMinutes: -330,
    inputWeight: 70,
    inputWeightUnit: 'kg',
    weightKg: 70,
    weightLb: 154.3234,
    inputHeightUnit: 'cm',
    heightCm: 175,
    ageYears: 30,
    gender: 'woman',
    bmi: calculateBmi(70, 175),
    createdAt: 1,
    updatedAt: 1,
  };

  test('announces empty and single-point states without implying a trend', async () => {
    const empty = await render(<BmiTrendChart measurements={[]} metric="bmi" weightUnit="kg" />);
    expect(empty.getByLabelText('No BMI measurements in this range')).toBeTruthy();
    await empty.unmount();
    const single = await render(
      <BmiTrendChart measurements={[measurement]} metric="bmi" weightUnit="kg" />,
    );
    expect(single.getByLabelText('One BMI measurement, 22.9')).toBeTruthy();
  });
});
