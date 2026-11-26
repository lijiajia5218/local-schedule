import type {
  DailyMemo,
  DailyTask,
  ParseShorthandResult,
  ParseTimeResult,
  ParseWeeklyFocusResult,
  WeeklyFocus,
} from '@/types/schedule';

type SingleTimeResult =
  | { ok: true; normalized: string; minutes: number }
  | { ok: false; error: string };

export type QuickLineResult =
  | { kind: 'empty' }
  | { kind: 'memo'; content: string }
  | { kind: 'task'; parsed: ParseShorthandResult }
  | { kind: 'invalid'; error: string; raw: string };

const PIPE_REGEX = /[|｜]/;
const TODO_PREFIX_REGEX = /^\s*(?:【\s*([xX√✓]?)\s*】|\[\s*([xX√✓]?)\s*\])\s*/;
const MEMO_PREFIX_REGEX = /^\s*[-－]\s*/;

export interface ParsedTodoPrefix {
  hasPrefix: boolean;
  isDone: boolean;
  rest: string;
}

/**
 * Strips leading todo prefix `【】`/`【 】`/`【x】`/`【√】`/`[]`/`[ ]`/`[x]` if present.
 */
export function extractTodoPrefix(raw: string): ParsedTodoPrefix {
  const match = raw.match(TODO_PREFIX_REGEX);
  if (!match) {
    return { hasPrefix: false, isDone: false, rest: raw };
  }
  const marker = (match[1] ?? match[2] ?? '').trim();
  return {
    hasPrefix: true,
    isDone: marker.length > 0,
    rest: raw.slice(match[0].length),
  };
}

/**
 * Parses `H`, `HH`, `H:MM`, `HH:MM` (also supporting `：`, `.`, and `。` like `10.30`) into `HH:MM`.
 */
export function parseTimePart(raw: string): SingleTimeResult {
  const trimmed = raw.trim().replace(/[：.。]/g, ':');
  if (!trimmed) {
    return { ok: false, error: '时间不能为空' };
  }

  const colonIdx = trimmed.indexOf(':');
  let hourStr: string;
  let minStr: string;

  if (colonIdx !== -1) {
    if (trimmed.indexOf(':', colonIdx + 1) !== -1) {
      return { ok: false, error: `无效时间格式「${trimmed}」` };
    }
    hourStr = trimmed.slice(0, colonIdx);
    minStr = trimmed.slice(colonIdx + 1);
    if (!/^\d{2}$/.test(minStr)) {
      return { ok: false, error: `分钟需为两位数字，如 09:30（当前：${trimmed}）` };
    }
  } else {
    hourStr = trimmed;
    minStr = '00';
  }

  if (!/^\d{1,2}$/.test(hourStr)) {
    return { ok: false, error: `无效小时格式「${trimmed}」` };
  }

  const hour = Number(hourStr);
  const minute = Number(minStr);

  if (hour < 0 || hour > 23) {
    return { ok: false, error: `小时「${hourStr}」需在 0-23 之间（不支持跨天）` };
  }
  if (minute < 0 || minute > 59) {
    return { ok: false, error: `分钟「${minStr}」需在 00-59 之间` };
  }

  const normalized = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  return {
    ok: true,
    normalized,
    minutes: hour * 60 + minute,
  };
}

/**
 * Parses `9-10` or `10:30-11:30` (supporting full-width `－` / `–`). Enforces end > start.
 */
export function parseTimeRange(raw: string): ParseTimeResult {
  const trimmed = raw.trim().replace(/[－–]/g, '-');
  if (!trimmed) {
    return { ok: false, error: '请输入时间段，例如 9-10 或 10:30-11:30' };
  }

  const segments = trimmed.split('-');
  if (segments.length !== 2) {
    return { ok: false, error: '时间段格式应为「起始-结束」，例如 9-10 或 10:30-11:30' };
  }

  const startRes = parseTimePart(segments[0]);
  if (!startRes.ok) {
    return startRes;
  }

  const endRes = parseTimePart(segments[1]);
  if (!endRes.ok) {
    return endRes;
  }

  if (endRes.minutes <= startRes.minutes) {
    return { ok: false, error: '结束时间必须晚于起始时间，且不支持跨天' };
  }

  return {
    ok: true,
    startTime: startRes.normalized,
    endTime: endRes.normalized,
    startMinutes: startRes.minutes,
    endMinutes: endRes.minutes,
  };
}

/**
 * Parses a shorthand line `【】9-10｜周会` or `9-10|周会` by stripping optional todo prefix
 * and splitting on the first `|` or `｜`. Preserves `raw` on any failure.
 */
export function parseShorthandTask(raw: string): ParseShorthandResult {
  const { hasPrefix, isDone, rest } = extractTodoPrefix(raw);
  const match = rest.match(PIPE_REGEX);
  if (!match || match.index === undefined) {
    return {
      ok: false,
      error: hasPrefix
        ? '待办需包含时间段，格式：【】9-10｜任务名'
        : '请使用「【】9-10｜任务名」或「9-10|任务名」格式',
      raw,
    };
  }

  const pipeIdx = match.index;
  const timePart = rest.slice(0, pipeIdx);
  const titlePart = rest.slice(pipeIdx + 1).trim();

  const rangeRes = parseTimeRange(timePart);
  if (!rangeRes.ok) {
    return {
      ok: false,
      error: rangeRes.error,
      raw,
    };
  }

  if (!titlePart) {
    return {
      ok: false,
      error: '任务名称不能为空',
      raw,
    };
  }

  return {
    ok: true,
    startTime: rangeRes.startTime,
    endTime: rangeRes.endTime,
    title: titlePart,
    isDone,
  };
}

/**
 * Strict document-line classifier inside a day cell (disallows bare plain text):
 * - Starts with `-` / `－` -> memo (must be non-empty after prefix)
 * - Starts with todo prefix (`【】`/`【x】`/`[]` etc.) or contains `|`/`｜` -> task
 * - Otherwise -> invalid (plain text rejected)
 */
export function classifyQuickLine(raw: string): QuickLineResult {
  if (!raw.trim()) {
    return { kind: 'empty' };
  }

  const memoMatch = raw.match(MEMO_PREFIX_REGEX);
  if (memoMatch) {
    const content = raw.slice(memoMatch[0].length).trim();
    if (!content) {
      return {
        kind: 'invalid',
        error: '备忘内容不能为空，格式：- 备忘内容',
        raw,
      };
    }
    return { kind: 'memo', content };
  }

  const prefix = extractTodoPrefix(raw);
  if (prefix.hasPrefix || PIPE_REGEX.test(raw)) {
    return { kind: 'task', parsed: parseShorthandTask(raw) };
  }

  return {
    kind: 'invalid',
    error: '不支持纯文本，请用「【】9-10｜任务」记待办，或「- 内容」记备忘',
    raw,
  };
}

/**
 * Parses a weekly focus line:
 *   `【】任务名 @目标时间 - 状态备注`
 * Also supports `【x】`, `（目标时间）` / `(目标时间)`, and `//状态备注`.
 * Disallows bare plain text without a leading `【】` / `[]` todo marker.
 */
export function parseWeeklyFocusLine(raw: string): ParseWeeklyFocusResult {
  const { hasPrefix, isDone, rest } = extractTodoPrefix(raw);
  if (!hasPrefix) {
    return {
      ok: false,
      error: '周重点请以「【】」开头，格式：【】任务名 @目标时间 - 状态备注',
      raw,
    };
  }

  // Split status note on whitespace-padded `-` / `－` or `//` so hyphenated titles like GPT-4o stay intact.
  let mainPart = rest;
  let statusNote: string | null = null;
  const noteMatch = rest.match(/(?:\s+[-－]\s+|\s*\/\/\s*)(.+)$/);
  if (noteMatch && noteMatch.index !== undefined) {
    mainPart = rest.slice(0, noteMatch.index);
    const trimmedNote = noteMatch[1].trim();
    statusNote = trimmedNote.length > 0 ? trimmedNote : null;
  }

  // Extract target time from `@token` (preferred) or trailing `（token）` / `(token)`
  let titlePart = mainPart;
  let targetText: string | null = null;

  const atMatch = mainPart.match(/(?:^|\s)@([^\s]+)/);
  if (atMatch && atMatch.index !== undefined) {
    targetText = atMatch[1].trim() || null;
    titlePart = (
      mainPart.slice(0, atMatch.index) + mainPart.slice(atMatch.index + atMatch[0].length)
    ).trim();
  } else {
    const parenMatch = mainPart.match(/[（(]([^（）()]+)[）)]\s*$/);
    if (parenMatch && parenMatch.index !== undefined) {
      targetText = parenMatch[1].trim() || null;
      titlePart = mainPart.slice(0, parenMatch.index).trim();
    }
  }

  const title = titlePart.trim();
  if (!title) {
    return {
      ok: false,
      error: '周重点任务名不能为空',
      raw,
    };
  }

  return {
    ok: true,
    title,
    targetText,
    statusNote,
    isDone,
  };
}

export function formatWeeklyFocusLine(
  focus: Pick<WeeklyFocus, 'title' | 'targetText' | 'statusNote' | 'isDone'>
): string {
  const prefix = focus.isDone ? '【x】' : '【】';
  const target = focus.targetText ? ` @${focus.targetText}` : '';
  const note = focus.statusNote ? ` - ${focus.statusNote}` : '';
  return `${prefix}${focus.title}${target}${note}`;
}

const BARE_PREFIX_REGEX = /^(?:【\s*[xX√✓]?\s*】|\[\s*[xX√✓]?\s*\]|[-－])$/;

/**
 * Returns true when input is empty or contains only an auto-prefilled marker (`【】`, `- `, etc.)
 * with no content after it.
 */
export function isBlankOrBarePrefix(raw: string): boolean {
  const trimmed = raw.trim();
  return trimmed === '' || BARE_PREFIX_REGEX.test(trimmed);
}

export function formatDailyTaskLine(
  task: Pick<DailyTask, 'startTime' | 'endTime' | 'title' | 'isDone'>
): string {
  const prefix = task.isDone ? '【x】' : '【】';
  return `${prefix}${task.startTime}-${task.endTime}｜${task.title}`;
}

export function formatDailyMemoLine(memo: Pick<DailyMemo, 'content'>): string {
  return `- ${memo.content}`;
}

export function formatCompactRange(startTime: string, endTime: string): string {
  return `${startTime}-${endTime}`;
}
