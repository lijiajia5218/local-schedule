import { describe, expect, it } from 'vitest';
import {
  classifyQuickLine,
  formatDailyMemoLine,
  formatDailyTaskLine,
  formatWeeklyFocusLine,
  isBlankOrBarePrefix,
  parseShorthandTask,
  parseTimePart,
  parseTimeRange,
  parseWeeklyFocusLine,
} from '@/core/timeParser';

describe('parseTimePart', () => {
  it('supports H, HH, H:MM, HH:MM formats including full-width colon', () => {
    expect(parseTimePart('9')).toEqual({ ok: true, normalized: '09:00', minutes: 540 });
    expect(parseTimePart('09')).toEqual({ ok: true, normalized: '09:00', minutes: 540 });
    expect(parseTimePart('9:05')).toEqual({ ok: true, normalized: '09:05', minutes: 545 });
    expect(parseTimePart('10:30')).toEqual({ ok: true, normalized: '10:30', minutes: 630 });
    expect(parseTimePart('10：30')).toEqual({ ok: true, normalized: '10:30', minutes: 630 });
    expect(parseTimePart('23:59')).toEqual({ ok: true, normalized: '23:59', minutes: 1439 });
  });

  it('rejects out-of-range or malformed time strings', () => {
    expect(parseTimePart('').ok).toBe(false);
    expect(parseTimePart('24:00').ok).toBe(false);
    expect(parseTimePart('9:60').ok).toBe(false);
    expect(parseTimePart('9:5').ok).toBe(false);
    expect(parseTimePart('abc').ok).toBe(false);
  });
});

describe('parseTimeRange', () => {
  it('parses valid time ranges including full-width dash', () => {
    expect(parseTimeRange('9-10')).toEqual({
      ok: true,
      startTime: '09:00',
      endTime: '10:00',
      startMinutes: 540,
      endMinutes: 600,
    });
    expect(parseTimeRange('10：30－11：30')).toEqual({
      ok: true,
      startTime: '10:30',
      endTime: '11:30',
      startMinutes: 630,
      endMinutes: 690,
    });
  });

  it('rejects end <= start or cross-day attempts', () => {
    expect(parseTimeRange('10-9').ok).toBe(false);
    expect(parseTimeRange('10-10').ok).toBe(false);
    expect(parseTimeRange('25-26').ok).toBe(false);
  });
});

describe('parseShorthandTask', () => {
  it('supports 【】/【x】/[] prefixes and half-width | or full-width ｜', () => {
    expect(parseShorthandTask('【】9-10｜周会')).toEqual({
      ok: true,
      startTime: '09:00',
      endTime: '10:00',
      title: '周会',
      isDone: false,
    });
    expect(parseShorthandTask('【x】10:30-11:30|评审')).toEqual({
      ok: true,
      startTime: '10:30',
      endTime: '11:30',
      title: '评审',
      isDone: true,
    });
    expect(parseShorthandTask('[]9-10|晨会')).toEqual({
      ok: true,
      startTime: '09:00',
      endTime: '10:00',
      title: '晨会',
      isDone: false,
    });
    expect(parseShorthandTask('10：30－11：30｜产品评审|带补充')).toEqual({
      ok: true,
      startTime: '10:30',
      endTime: '11:30',
      title: '产品评审|带补充',
      isDone: false,
    });
  });

  it('returns error while preserving raw input on invalid cases', () => {
    const missingPipe = parseShorthandTask('【】周会');
    expect(missingPipe.ok).toBe(false);
    if (!missingPipe.ok) {
      expect(missingPipe.raw).toBe('【】周会');
    }

    const emptyTitle = parseShorthandTask('【】9-10｜   ');
    expect(emptyTitle.ok).toBe(false);
    if (!emptyTitle.ok) {
      expect(emptyTitle.raw).toBe('【】9-10｜   ');
    }
  });
});

describe('classifyQuickLine', () => {
  it('recognizes 【】 todo and - memo, and rejects bare plain text', () => {
    expect(classifyQuickLine('   ')).toEqual({ kind: 'empty' });
    expect(classifyQuickLine('- 会后同步纪要')).toEqual({
      kind: 'memo',
      content: '会后同步纪要',
    });
    expect(classifyQuickLine('－ 全角横杠备忘')).toEqual({
      kind: 'memo',
      content: '全角横杠备忘',
    });
    expect(classifyQuickLine('-   ').kind).toBe('invalid');
    expect(classifyQuickLine('这是一句纯文本').kind).toBe('invalid');
    expect(classifyQuickLine('【】16-17｜测试全角分隔符')).toEqual({
      kind: 'task',
      parsed: {
        ok: true,
        startTime: '16:00',
        endTime: '17:00',
        title: '测试全角分隔符',
        isDone: false,
      },
    });
  });
});

describe('parseWeeklyFocusLine & formatWeeklyFocusLine', () => {
  it('parses 【】title @target - statusNote syntax and rejects plain text', () => {
    expect(parseWeeklyFocusLine('【】产品方案评审报告 @0315')).toEqual({
      ok: true,
      title: '产品方案评审报告',
      targetText: '0315',
      statusNote: null,
      isDone: false,
    });

    expect(parseWeeklyFocusLine('【】季度规划同步会 @0315以后 - 延至下月')).toEqual({
      ok: true,
      title: '季度规划同步会',
      targetText: '0315以后',
      statusNote: '延至下月',
      isDone: false,
    });

    expect(parseWeeklyFocusLine('【x】Web-UI 对比测试（本周五）//已完成初稿')).toEqual({
      ok: true,
      title: 'Web-UI 对比测试',
      targetText: '本周五',
      statusNote: '已完成初稿',
      isDone: true,
    });

    expect(parseWeeklyFocusLine('纯文本重点').ok).toBe(false);
    expect(parseWeeklyFocusLine('【】 @0315').ok).toBe(false);
  });

  it('formats WeeklyFocus back to single-line syntax', () => {
    expect(
      formatWeeklyFocusLine({
        title: '季度同步会',
        targetText: '0315以后',
        statusNote: '延至下月',
        isDone: false,
      })
    ).toBe('【】季度同步会 @0315以后 - 延至下月');
  });
});

describe('isBlankOrBarePrefix & daily formatters', () => {
  it('treats empty strings and bare prefilled markers as blank', () => {
    expect(isBlankOrBarePrefix('')).toBe(true);
    expect(isBlankOrBarePrefix('   ')).toBe(true);
    expect(isBlankOrBarePrefix('【】')).toBe(true);
    expect(isBlankOrBarePrefix('【x】 ')).toBe(true);
    expect(isBlankOrBarePrefix('[]')).toBe(true);
    expect(isBlankOrBarePrefix('- ')).toBe(true);
    expect(isBlankOrBarePrefix('－ ')).toBe(true);
    expect(isBlankOrBarePrefix('【】9')).toBe(false);
    expect(isBlankOrBarePrefix('- 备忘')).toBe(false);
  });

  it('round-trips DailyTask and DailyMemo formatting cleanly', () => {
    const line = formatDailyTaskLine({
      startTime: '09:30',
      endTime: '11:00',
      title: '产品方案评审',
      isDone: false,
    });
    expect(line).toBe('【】09:30-11:00｜产品方案评审');
    expect(parseShorthandTask(line)).toEqual({
      ok: true,
      startTime: '09:30',
      endTime: '11:00',
      title: '产品方案评审',
      isDone: false,
    });

    expect(
      formatDailyTaskLine({
        startTime: '14:00',
        endTime: '15:00',
        title: '周会',
        isDone: true,
      })
    ).toBe('【x】14:00-15:00｜周会');

    expect(formatDailyMemoLine({ content: '记得带会议纪要' })).toBe('- 记得带会议纪要');
  });
});
