import { describe, expect, it } from 'vitest';
import { getWeekDates, weekStartOf } from '@/core/dateUtils';

describe('weekStartOf', () => {
  it('returns Monday for any weekday including Sunday', () => {
    // 2026-11-23 is Monday, 2026-11-29 is Sunday
    expect(weekStartOf('2026-11-23')).toBe('2026-11-23');
    expect(weekStartOf('2026-11-25')).toBe('2026-11-23');
    expect(weekStartOf('2026-11-28')).toBe('2026-11-23');
    expect(weekStartOf('2026-11-29')).toBe('2026-11-23');
  });
});

describe('getWeekDates', () => {
  it('returns 7 days from Monday to Sunday with weekend flags on Saturday and Sunday', () => {
    const days = getWeekDates('2026-11-23', '2026-11-24');
    expect(days).toHaveLength(7);
    expect(days.map((d) => d.date)).toEqual([
      '2026-11-23',
      '2026-11-24',
      '2026-11-25',
      '2026-11-26',
      '2026-11-27',
      '2026-11-28',
      '2026-11-29',
    ]);
    expect(days.map((d) => d.weekdayLabel)).toEqual([
      '周一',
      '周二',
      '周三',
      '周四',
      '周五',
      '周六',
      '周日',
    ]);
    expect(days[1].isToday).toBe(true);
    expect(days[5].isWeekend).toBe(true);
    expect(days[6].isWeekend).toBe(true);
    expect(days[4].isWeekend).toBe(false);
  });
});
