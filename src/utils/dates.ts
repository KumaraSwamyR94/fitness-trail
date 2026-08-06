export interface CalendarDay {
  key: string;
  date: Date;
  isCurrentMonth: boolean;
}

export function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function fromLocalDateKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12, 0, 0, 0);
}

export function addMonths(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1, 12, 0, 0, 0);
}

export function getFirstWeekday(locale: string): number {
  try {
    const weekInfo = (new Intl.Locale(locale) as Intl.Locale & {
      weekInfo?: { firstDay: number };
      getWeekInfo?: () => { firstDay: number };
    }).weekInfo ?? (new Intl.Locale(locale) as Intl.Locale & {
      getWeekInfo?: () => { firstDay: number };
    }).getWeekInfo?.();
    return weekInfo ? weekInfo.firstDay % 7 : 0;
  } catch {
    return 0;
  }
}

export function getWeekdayLabels(locale: string, firstWeekday: number): string[] {
  const sunday = new Date(2024, 0, 7, 12);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(sunday);
    date.setDate(sunday.getDate() + ((firstWeekday + index) % 7));
    return new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(date);
  });
}

export function buildMonthGrid(month: Date, firstWeekday: number): CalendarDay[] {
  const first = startOfMonth(month);
  const offset = (first.getDay() - firstWeekday + 7) % 7;
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - offset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return {
      key: toLocalDateKey(date),
      date,
      isCurrentMonth: date.getMonth() === month.getMonth(),
    };
  });
}

export function buildMonthWeeks(month: Date, firstWeekday: number): CalendarDay[][] {
  const days = buildMonthGrid(month, firstWeekday);
  return Array.from({ length: 6 }, (_, index) => days.slice(index * 7, index * 7 + 7));
}

export function monthRange(month: Date): { start: string; end: string } {
  const start = startOfMonth(month);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 0, 12);
  return { start: toLocalDateKey(start), end: toLocalDateKey(end) };
}

export function mergeDateAndTime(datePart: Date, timePart: Date): Date {
  return new Date(
    datePart.getFullYear(),
    datePart.getMonth(),
    datePart.getDate(),
    timePart.getHours(),
    timePart.getMinutes(),
    0,
    0,
  );
}
