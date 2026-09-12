import type { BmiMeasurement, BmiMeasurementInput } from '@/types/bmi';
import {
  calculateBmi,
  calculateBmiRangeAverages,
  centimetersToFeetInches,
  classifyAdultBmi,
  convertWeightValue,
  feetInchesToCentimeters,
  filterMeasurementsByRange,
  formatBmi,
  getChartDomain,
  validateBmiMeasurementInput,
} from '@/utils/bmi';

function measurement(id: string, measuredAt: number): BmiMeasurement {
  return {
    id,
    profileId: 'p1',
    measuredAt,
    localDate: '2026-08-06',
    timezoneOffsetMinutes: -330,
    inputWeight: 70,
    inputWeightUnit: 'kg',
    weightKg: 70,
    weightLb: 154.3234,
    inputHeightUnit: 'cm',
    heightCm: 175,
    ageYears: 30,
    gender: 'prefer_not_to_say',
    bmi: calculateBmi(70, 175),
    createdAt: measuredAt,
    updatedAt: measuredAt,
  };
}

const validInput: BmiMeasurementInput = {
  measuredAt: new Date('2026-08-06T06:00:00.000Z'),
  inputWeight: 70,
  inputWeightUnit: 'kg',
  inputHeightUnit: 'cm',
  heightCm: 175,
  ageYears: 30,
  gender: 'non_binary',
};

describe('BMI and height utilities', () => {
  test('converts feet and inches to centimetres and back without losing the measurement', () => {
    const heightCm = feetInchesToCentimeters(5, 9);
    expect(heightCm).toBeCloseTo(175.26, 10);
    const imperial = centimetersToFeetInches(heightCm);
    expect(imperial.feet).toBe(5);
    expect(imperial.inches).toBeCloseTo(9, 10);
  });

  test('rejects malformed imperial height values', () => {
    expect(Number.isNaN(feetInchesToCentimeters(5.5, 8))).toBe(true);
    expect(Number.isNaN(feetInchesToCentimeters(5, 12))).toBe(true);
    expect(Number.isNaN(feetInchesToCentimeters(-1, 8))).toBe(true);
  });

  test('calculates the same BMI after metric and imperial weight conversion', () => {
    const metricBmi = calculateBmi(70, 175);
    const pounds = convertWeightValue(70, 'kg', 'lb');
    const kilograms = convertWeightValue(pounds, 'lb', 'kg');
    expect(calculateBmi(kilograms, 175)).toBeCloseTo(metricBmi, 10);
    expect(formatBmi(metricBmi)).toBe('22.9');
  });

  test.each([
    [18.49, 'underweight'],
    [18.5, 'healthy'],
    [24.999, 'healthy'],
    [25, 'overweight'],
    [29.999, 'overweight'],
    [30, 'obesity'],
  ] as const)('classifies %s using unrounded adult thresholds', (bmi, expected) => {
    expect(classifyAdultBmi(bmi)).toBe(expected);
  });

  test('validates future dates, positive values, and adult ages', () => {
    expect(
      validateBmiMeasurementInput(validInput, new Date('2026-08-06T07:00:00.000Z').getTime()),
    ).toEqual({});
    expect(
      validateBmiMeasurementInput(
        {
          ...validInput,
          measuredAt: new Date('2026-08-07T00:00:00.000Z'),
          inputWeight: 0,
          heightCm: Number.NaN,
          ageYears: 17,
        },
        new Date('2026-08-06T07:00:00.000Z').getTime(),
      ),
    ).toEqual(
      expect.objectContaining({
        measuredAt: expect.any(String),
        weight: expect.any(String),
        height: expect.any(String),
        age: expect.any(String),
      }),
    );
  });
});

describe('BMI chart utilities', () => {
  const now = new Date('2026-08-06T12:00:00.000Z').getTime();
  const day = 24 * 60 * 60 * 1000;
  const values = [
    measurement('today', now),
    measurement('week-boundary', now - 7 * day),
    measurement('month', now - 20 * day),
    measurement('old', now - 100 * day),
  ];

  test('filters inclusive rolling ranges and preserves all history', () => {
    expect(filterMeasurementsByRange(values, '1W', now).map((item) => item.id)).toEqual([
      'today',
      'week-boundary',
    ]);
    expect(filterMeasurementsByRange(values, '30D', now).map((item) => item.id)).toEqual([
      'today',
      'week-boundary',
      'month',
    ]);
    expect(filterMeasurementsByRange(values, 'All', now)).toHaveLength(4);
  });

  test('pads single and flat chart values to a visible domain', () => {
    expect(getChartDomain([22.5], 'bmi')).toEqual({ min: 21.5, max: 23.5 });
    expect(getChartDomain([70, 70], 'weight')).toEqual({ min: 66.5, max: 73.5 });
    expect(getChartDomain([], 'bmi')).toEqual({ min: 0, max: 1 });
  });

  test('calculates BMI and normalized weight averages in the requested unit', () => {
    const metricMeasurement = measurement('metric', now);
    const imperialMeasurement: BmiMeasurement = {
      ...measurement('imperial', now - day),
      inputWeight: 176.3696,
      inputWeightUnit: 'lb',
      weightKg: 80,
      weightLb: 176.3696,
      bmi: calculateBmi(80, 175),
    };

    const metricAverages = calculateBmiRangeAverages(
      [metricMeasurement, imperialMeasurement],
      'kg',
    );
    expect(metricAverages.averageBmi).toBeCloseTo(
      (metricMeasurement.bmi + imperialMeasurement.bmi) / 2,
      10,
    );
    expect(metricAverages.averageWeight).toBe(75);

    const imperialAverages = calculateBmiRangeAverages(
      [metricMeasurement, imperialMeasurement],
      'lb',
    );
    expect(imperialAverages.averageWeight).toBeCloseTo(
      (metricMeasurement.weightLb + imperialMeasurement.weightLb) / 2,
      10,
    );
  });

  test('returns no averages for an empty range and the measurement values for a single entry', () => {
    expect(calculateBmiRangeAverages([], 'kg')).toEqual({
      averageBmi: null,
      averageWeight: null,
    });

    const singleMeasurement = measurement('single', now);
    expect(calculateBmiRangeAverages([singleMeasurement], 'kg')).toEqual({
      averageBmi: singleMeasurement.bmi,
      averageWeight: singleMeasurement.weightKg,
    });
  });
});
