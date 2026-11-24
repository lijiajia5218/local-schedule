export interface WeekDayMeta {
  date: string;
  dayOfWeek: number; // 1 (Mon) .. 7 (Sun)
  weekdayLabel: string;
  shortWeekdayLabel: string;
  dayNum: number;
  monthNum: number;
  isWeekend: boolean;
  isToday: boolean;
}

const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] as const;

export function parseLocalDate(dateStr: string): Date {
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    throw new Error(`无效日期格式: ${dateStr}`);
  }
  const [year, month, day] = parts;
  return new Date(year, month - 1, day);
}

export function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayStr(): string {
  return formatLocalDate(new Date());
}

export function addDays(dateStr: string, delta: number): string {
  const d = parseLocalDate(dateStr);
  d.setDate(d.getDate() + delta);
  return formatLocalDate(d);
}

export function addWeeks(weekStartStr: string, deltaWeeks: number): string {
  return addDays(weekStartStr, deltaWeeks * 7);
}

/**
 * Monday is the first day of the week (index 0).
 * JS Date.getDay(): Sun=0, Mon=1, ..., Sat=6 -> offset = (day + 6) % 7.
 */
export function weekStartOf(dateStr: string): string {
  const d = parseLocalDate(dateStr);
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  return formatLocalDate(d);
}

export function getWeekdayLabel(dateStr: string): string {
  const d = parseLocalDate(dateStr);
  const index = (d.getDay() + 6) % 7;
  return WEEKDAY_LABELS[index];
}

export function isWeekendDate(dateStr: string): boolean {
  const d = parseLocalDate(dateStr);
  const day = d.getDay();
  return day === 0 || day === 6;
}

export function getWeekDates(weekStartStr: string, referenceToday = todayStr()): WeekDayMeta[] {
  const monday = weekStartOf(weekStartStr);
  const result: WeekDayMeta[] = [];

  for (let i = 0; i < 7; i += 1) {
    const dateStr = addDays(monday, i);
    const parsed = parseLocalDate(dateStr);
    result.push({
      date: dateStr,
      dayOfWeek: i + 1,
      weekdayLabel: WEEKDAY_LABELS[i],
      shortWeekdayLabel: WEEKDAY_LABELS[i],
      dayNum: parsed.getDate(),
      monthNum: parsed.getMonth() + 1,
      isWeekend: i >= 5,
      isToday: dateStr === referenceToday,
    });
  }

  return result;
}

export function formatWeekRangeLabel(weekStartStr: string): string {
  const start = parseLocalDate(weekStartStr);
  const end = parseLocalDate(addDays(weekStartStr, 6));
  const startYear = start.getFullYear();
  const endYear = end.getFullYear();
  const currentYear = new Date().getFullYear();

  const startPart = `${start.getMonth() + 1}月${start.getDate()}日`;
  const endPart = `${end.getMonth() + 1}月${end.getDate()}日`;

  if (startYear !== endYear) {
    return `${startYear}年${startPart} - ${endYear}年${endPart}`;
  }
  if (startYear !== currentYear) {
    return `${startYear}年 ${startPart} - ${endPart}`;
  }
  return `${startPart} - ${endPart}`;
}

export function formatFullDayLabel(dateStr: string): string {
  const d = parseLocalDate(dateStr);
  const weekday = getWeekdayLabel(dateStr);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 · ${weekday}`;
}

export function formatMonthDayLabel(dateStr: string): string {
  const d = parseLocalDate(dateStr);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}-${dd}`;
}
