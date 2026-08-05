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
    [{ reps: 0, inputWeight: 20, inputUnit: 'kg' as const, tutSeconds: 0 }, 'Repetitions'],
    [{ reps: 8, inputWeight: -1, inputUnit: 'kg' as const, tutSeconds: 0 }, 'Weight'],
    [{ reps: 8, inputWeight: 20, inputUnit: 'kg' as const, tutSeconds: -1 }, 'Time under tension'],
  ])('rejects invalid set data', (input, message) => {
    expect(validateSetInput(input)).toContain(message);
  });

  test('accepts zero weight and zero TUT', () => {
    expect(validateSetInput({ reps: 1, inputWeight: 0, inputUnit: 'lb', tutSeconds: 0 })).toBeNull();
  });
});
