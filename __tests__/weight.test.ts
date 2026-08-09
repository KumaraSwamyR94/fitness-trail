import { convertWeight, formatWeight, POUNDS_PER_KILOGRAM, validateSetInput } from '@/utils/weight';

describe('weight conversion and validation', () => {
  test('stores full-precision kg and lb values', () => {
    expect(convertWeight(100, 'kg')).toEqual({ weightKg: 100, weightLb: 100 * POUNDS_PER_KILOGRAM });
    expect(convertWeight(220.462, 'lb').weightKg).toBeCloseTo(100, 10);
  });

  test('formats display values to two decimals without changing stored precision', () => {
    expect(formatWeight(convertWeight(12.3456, 'kg').weightLb)).toBe('27.22');
  });

  test.each([
    [{ kind: 'strength' as const, reps: 0, inputWeight: 20, inputUnit: 'kg' as const, tutSeconds: 0 }, 'Repetitions'],
    [{ kind: 'strength' as const, reps: 8, inputWeight: -1, inputUnit: 'kg' as const, tutSeconds: 0 }, 'Weight'],
    [{ kind: 'strength' as const, reps: 8, inputWeight: 20, inputUnit: 'kg' as const, tutSeconds: -1 }, 'Time under tension'],
  ])('rejects invalid set data', (input, message) => {
    expect(validateSetInput(input, 'free_weight')).toContain(message);
  });

  test('accepts zero weight and zero TUT', () => {
    expect(validateSetInput({ kind: 'strength', reps: 1, inputWeight: 0, inputUnit: 'lb', tutSeconds: 0 }, 'machine')).toBeNull();
  });

  test('accepts omitted added weight only for body-weight exercises', () => {
    const input = { kind: 'strength' as const, reps: 10, inputWeight: null, inputUnit: 'kg' as const, tutSeconds: 0 };
    expect(validateSetInput(input, 'body_weight')).toBeNull();
    expect(validateSetInput(input, 'free_weight')).toContain('Weight is required');
  });

  test('validates cardio metrics and rejects strength fields for cardio', () => {
    expect(validateSetInput({ kind: 'duration', durationSeconds: 1 }, 'cardio')).toBeNull();
    expect(validateSetInput({ kind: 'calories', calories: 120 }, 'cardio')).toBeNull();
    expect(validateSetInput({ kind: 'calories', calories: 1.5 }, 'cardio')).toContain('whole number');
    expect(validateSetInput({ kind: 'strength', reps: 8, inputWeight: 0, inputUnit: 'kg', tutSeconds: 0 }, 'cardio')).toContain('duration or calories');
  });
});
