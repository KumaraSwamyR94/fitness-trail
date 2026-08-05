import { cleanDisplayName, normalizeName, validateName } from '@/utils/names';

describe('exercise and session names', () => {
  test('trims, collapses whitespace, and compares case-insensitively', () => {
    expect(cleanDisplayName('  Barbell   Bench\nPress  ')).toBe('Barbell Bench Press');
    expect(normalizeName('  BARBELL   Bench Press ')).toBe('barbell bench press');
  });

  test('requires a name and enforces the persisted length limit', () => {
    expect(validateName('   ')).toBe('Enter a name.');
    expect(validateName('a'.repeat(81))).toContain('80');
    expect(validateName('Leg Day')).toBeNull();
  });
});
