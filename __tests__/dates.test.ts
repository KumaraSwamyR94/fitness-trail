import { buildMonthGrid, buildMonthWeeks, fromLocalDateKey, mergeDateAndTime, monthRange, toLocalDateKey } from '@/utils/dates';

describe('stable local calendar dates', () => {
  test('round-trips a local date without UTC conversion', () => {
    const value = new Date(2026, 0, 3, 23, 45);
    expect(toLocalDateKey(value)).toBe('2026-01-03');
    expect(toLocalDateKey(fromLocalDateKey('2026-01-03'))).toBe('2026-01-03');
  });

  test('returns complete leap-month ranges and a six-week grid', () => {
    expect(monthRange(new Date(2024, 1, 18))).toEqual({ start: '2024-02-01', end: '2024-02-29' });
    const grid = buildMonthGrid(new Date(2024, 1, 18), 1);
    expect(grid).toHaveLength(42);
    expect(grid.filter((day) => day.isCurrentMonth)).toHaveLength(29);
  });

  test('merges an edited calendar date and clock time', () => {
    const result = mergeDateAndTime(new Date(2027, 5, 9), new Date(2020, 0, 1, 17, 35));
    expect([result.getFullYear(), result.getMonth(), result.getDate(), result.getHours(), result.getMinutes()]).toEqual([2027, 5, 9, 17, 35]);
  });

  test('groups every calendar month into six complete seven-day rows', () => {
    const weeks = buildMonthWeeks(new Date(2026, 7, 1), 0);
    expect(weeks).toHaveLength(6);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(weeks.flat()).toHaveLength(42);
  });
});
