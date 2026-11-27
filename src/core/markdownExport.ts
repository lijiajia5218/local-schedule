import { formatMonthDayLabel, getWeekDates } from '@/core/dateUtils';
import type { WeekBundle } from '@/types/schedule';

/**
 * Generates structured weekly Markdown (Section 6.4),
 * covering Weekly Focus items and all 7 days (Mon-Sun).
 */
export function generateWeekMarkdown(week: WeekBundle): string {
  const lines: string[] = [];
  lines.push(`# ${week.weekStart} 所在周`);
  lines.push('');
  lines.push('## 周重点待办');

  if (week.focuses.length === 0) {
    lines.push('- （暂无重点待办）');
  } else {
    for (const focus of week.focuses) {
      const mark = focus.isDone ? 'x' : ' ';
      const target = focus.targetText ? `（${focus.targetText}）` : '';
      const note = focus.statusNote ? `  ${focus.statusNote}` : '';
      lines.push(`- [${mark}] ${focus.title}${target}${note}`);
    }
  }

  const days = getWeekDates(week.weekStart);
  for (const day of days) {
    const mmdd = formatMonthDayLabel(day.date);
    lines.push('');
    lines.push(`## ${mmdd} ${day.weekdayLabel}`);

    const dayTasks = week.tasks
      .filter((t) => t.taskDate === day.date)
      .sort(
        (a, b) =>
          a.sortOrder - b.sortOrder ||
          a.startTime.localeCompare(b.startTime) ||
          a.endTime.localeCompare(b.endTime)
      );

    const dayMemos = week.memos
      .filter((m) => m.memoDate === day.date)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    if (dayTasks.length === 0 && dayMemos.length === 0) {
      lines.push('- （无日程记录）');
      continue;
    }

    for (const task of dayTasks) {
      const mark = task.isDone ? 'x' : ' ';
      lines.push(`- [${mark}] ${task.startTime}-${task.endTime} ${task.title}`);
    }
    for (const memo of dayMemos) {
      const reminder = memo.reminderTime ? ` @${memo.reminderTime}` : '';
      lines.push(`  - ${memo.content}${reminder}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}
