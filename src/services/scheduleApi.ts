import { invoke } from '@tauri-apps/api/core';
import { addDays, todayStr, weekStartOf } from '@/core/dateUtils';
import { generateWeekMarkdown } from '@/core/markdownExport';
import { parseTimePart } from '@/core/timeParser';
import type {
  AppSettings,
  BackupPayload,
  DailyMemo,
  DailyTask,
  DayBundle,
  WeekBundle,
  WeeklyFocus,
} from '@/types/schedule';

const STORAGE_KEY = 'local_schedule_v2';
const SETTINGS_KEY = 'local_schedule_settings_v1';

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

interface LocalDbSchema {
  weeklyFocus: WeeklyFocus[];
  dailyTask: DailyTask[];
  dailyMemo: DailyMemo[];
}

function createUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function buildSeedData(): LocalDbSchema {
  const today = todayStr();
  const monday = weekStartOf(today);
  const prevMonday = addDays(monday, -7);
  const nextMonday = addDays(monday, 7);

  const prevTue = addDays(prevMonday, 1);
  const prevThu = addDays(prevMonday, 3);
  const prevSat = addDays(prevMonday, 5);

  const tue = addDays(monday, 1);
  const wed = addDays(monday, 2);
  const thu = addDays(monday, 3);
  const fri = addDays(monday, 4);
  const sat = addDays(monday, 5);
  const sun = addDays(monday, 6);

  const nextMon = nextMonday;
  const nextWed = addDays(nextMonday, 2);
  const nextFri = addDays(nextMonday, 4);

  const now = new Date().toISOString();

  return {
    weeklyFocus: [
      {
        id: createUuid(),
        weekStart: prevMonday,
        title: '完成结构化周报模板梳理',
        targetText: '上周五',
        statusNote: '已归档',
        isDone: true,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: createUuid(),
        weekStart: monday,
        title: '产品方案评审与文档定稿',
        targetText: '本周五',
        statusNote: null,
        isDone: false,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: createUuid(),
        weekStart: monday,
        title: '季度规划专题同步会',
        targetText: '下周初',
        statusNote: '待排期',
        isDone: false,
        sortOrder: 1,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: createUuid(),
        weekStart: nextMonday,
        title: '桌面客户端安装包构建与验证',
        targetText: '下周三',
        statusNote: null,
        isDone: false,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      },
    ],
    dailyTask: [
      {
        id: createUuid(),
        taskDate: prevMonday,
        startTime: '09:30',
        endTime: '10:30',
        title: '需求调研与表结构讨论',
        isDone: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: createUuid(),
        taskDate: prevTue,
        startTime: '14:00',
        endTime: '16:00',
        title: '整理多周视图交互方案',
        isDone: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: createUuid(),
        taskDate: prevThu,
        startTime: '10:00',
        endTime: '11:30',
        title: 'SQLite 存储方案确认',
        isDone: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: createUuid(),
        taskDate: monday,
        startTime: '09:00',
        endTime: '10:00',
        title: '周例会与重点任务对齐',
        isDone: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: createUuid(),
        taskDate: monday,
        startTime: '14:00',
        endTime: '16:30',
        title: '梳理核心模块功能清单',
        isDone: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: createUuid(),
        taskDate: tue,
        startTime: '09:30',
        endTime: '11:00',
        title: '客户端界面设计与联调',
        isDone: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: createUuid(),
        taskDate: tue,
        startTime: '14:30',
        endTime: '15:30',
        title: '技术架构评审会',
        isDone: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: createUuid(),
        taskDate: wed,
        startTime: '10:00',
        endTime: '11:30',
        title: '专题同步会材料准备',
        isDone: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: createUuid(),
        taskDate: thu,
        startTime: '15:00',
        endTime: '17:00',
        title: 'SQLite 导出与恢复测试',
        isDone: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: createUuid(),
        taskDate: fri,
        startTime: '16:00',
        endTime: '17:00',
        title: '周度工作复盘与归档',
        isDone: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: createUuid(),
        taskDate: sat,
        startTime: '10:00',
        endTime: '11:30',
        title: '阅读技术书籍与整理笔记',
        isDone: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: createUuid(),
        taskDate: sun,
        startTime: '19:30',
        endTime: '20:30',
        title: '梳理下周重点待办清单',
        isDone: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: createUuid(),
        taskDate: nextMon,
        startTime: '09:00',
        endTime: '10:00',
        title: '下周工作计划同步',
        isDone: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: createUuid(),
        taskDate: nextWed,
        startTime: '14:00',
        endTime: '15:30',
        title: '阶段成果回顾与需求复核',
        isDone: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: createUuid(),
        taskDate: nextFri,
        startTime: '16:30',
        endTime: '17:30',
        title: 'Markdown 周报归档',
        isDone: false,
        createdAt: now,
        updatedAt: now,
      },
    ],
    dailyMemo: [
      {
        id: createUuid(),
        memoDate: prevSat,
        content: '上周复盘：周六周末列需与工作日同等支持录入',
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: createUuid(),
        memoDate: monday,
        content: '七日网格结构已核对，确认支持完整周一至周日',
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: createUuid(),
        memoDate: tue,
        content: '点击空白处输入「【】9-10｜任务」或「- 备忘」',
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: createUuid(),
        memoDate: sat,
        content: '周末条目与工作日同等可勾选、编辑和导出',
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      },
    ],
  };
}

function readLocalDb(): LocalDbSchema {
  if (typeof localStorage === 'undefined') {
    return buildSeedData();
  }
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const seed = buildSeedData();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
    return seed;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<LocalDbSchema>;
    return {
      weeklyFocus: Array.isArray(parsed.weeklyFocus) ? parsed.weeklyFocus : [],
      dailyTask: Array.isArray(parsed.dailyTask) ? parsed.dailyTask : [],
      dailyMemo: Array.isArray(parsed.dailyMemo) ? parsed.dailyMemo : [],
    };
  } catch {
    const seed = buildSeedData();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
    return seed;
  }
}

function writeLocalDb(db: LocalDbSchema): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  }
}

function readLocalSettings(): AppSettings {
  const defaultDir = '~/Documents/本地日程';
  if (typeof localStorage === 'undefined') {
    return {
      dataDir: defaultDir,
      dbPath: `${defaultDir}/data.sqlite`,
      exportsDir: `${defaultDir}/exports`,
      schemaVersion: 1,
    };
  }
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (!raw) {
    const initial: AppSettings = {
      dataDir: defaultDir,
      dbPath: `${defaultDir}/data.sqlite`,
      exportsDir: `${defaultDir}/exports`,
      schemaVersion: 1,
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(initial));
    return initial;
  }
  try {
    return JSON.parse(raw) as AppSettings;
  } catch {
    return {
      dataDir: defaultDir,
      dbPath: `${defaultDir}/data.sqlite`,
      exportsDir: `${defaultDir}/exports`,
      schemaVersion: 1,
    };
  }
}

export interface UpsertFocusInput {
  id?: string;
  weekStart: string;
  title: string;
  targetText?: string | null;
  statusNote?: string | null;
  isDone: boolean;
  sortOrder?: number;
}

export interface UpsertTaskInput {
  id?: string;
  taskDate: string;
  startTime: string;
  endTime: string;
  title: string;
  isDone: boolean;
}

export interface UpsertMemoInput {
  id?: string;
  memoDate: string;
  content: string;
  sortOrder?: number;
}

export const scheduleApi = {
  async getWeek(date: string): Promise<WeekBundle> {
    if (isTauriRuntime()) {
      return invoke<WeekBundle>('get_week', { date });
    }
    const db = readLocalDb();
    const weekStart = weekStartOf(date);
    const weekEnd = addDays(weekStart, 6);
    return {
      weekStart,
      weekEnd,
      focuses: db.weeklyFocus
        .filter((f) => f.weekStart === weekStart)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt)),
      tasks: db.dailyTask
        .filter((t) => t.taskDate >= weekStart && t.taskDate <= weekEnd)
        .sort(
          (a, b) =>
            a.taskDate.localeCompare(b.taskDate) ||
            a.startTime.localeCompare(b.startTime) ||
            a.endTime.localeCompare(b.endTime)
        ),
      memos: db.dailyMemo
        .filter((m) => m.memoDate >= weekStart && m.memoDate <= weekEnd)
        .sort(
          (a, b) =>
            a.memoDate.localeCompare(b.memoDate) ||
            a.sortOrder - b.sortOrder ||
            a.createdAt.localeCompare(b.createdAt)
        ),
    };
  },

  async getDay(date: string): Promise<DayBundle> {
    if (isTauriRuntime()) {
      return invoke<DayBundle>('get_day', { date });
    }
    const db = readLocalDb();
    return {
      date,
      tasks: db.dailyTask
        .filter((t) => t.taskDate === date)
        .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.endTime.localeCompare(b.endTime)),
      memos: db.dailyMemo
        .filter((m) => m.memoDate === date)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt)),
    };
  },

  async upsertFocus(input: UpsertFocusInput): Promise<WeeklyFocus> {
    if (isTauriRuntime()) {
      return invoke<WeeklyFocus>('upsert_focus', {
        id: input.id ?? null,
        weekStart: input.weekStart,
        title: input.title,
        targetText: input.targetText ?? null,
        statusNote: input.statusNote ?? null,
        isDone: input.isDone,
        sortOrder: input.sortOrder ?? null,
      });
    }

    const title = input.title.trim();
    if (!title) throw new Error('周重点待办任务名不能为空');

    const db = readLocalDb();
    const weekStart = weekStartOf(input.weekStart);
    const now = new Date().toISOString();
    const targetText = input.targetText?.trim() || null;
    const statusNote = input.statusNote?.trim() || null;

    const existingIdx = input.id ? db.weeklyFocus.findIndex((f) => f.id === input.id) : -1;
    if (existingIdx !== -1) {
      const updated: WeeklyFocus = {
        ...db.weeklyFocus[existingIdx],
        weekStart,
        title,
        targetText,
        statusNote,
        isDone: input.isDone,
        sortOrder: input.sortOrder ?? db.weeklyFocus[existingIdx].sortOrder,
        updatedAt: now,
      };
      db.weeklyFocus[existingIdx] = updated;
      writeLocalDb(db);
      return updated;
    }

    const maxOrder = db.weeklyFocus
      .filter((f) => f.weekStart === weekStart)
      .reduce((max, f) => Math.max(max, f.sortOrder), -1);

    const created: WeeklyFocus = {
      id: input.id ?? createUuid(),
      weekStart,
      title,
      targetText,
      statusNote,
      isDone: input.isDone,
      sortOrder: input.sortOrder ?? maxOrder + 1,
      createdAt: now,
      updatedAt: now,
    };
    db.weeklyFocus.push(created);
    writeLocalDb(db);
    return created;
  },

  async deleteFocus(id: string): Promise<void> {
    if (isTauriRuntime()) {
      return invoke<void>('delete_focus', { id });
    }
    const db = readLocalDb();
    db.weeklyFocus = db.weeklyFocus.filter((f) => f.id !== id);
    writeLocalDb(db);
  },

  async upsertTask(input: UpsertTaskInput): Promise<DailyTask> {
    if (isTauriRuntime()) {
      return invoke<DailyTask>('upsert_task', {
        id: input.id ?? null,
        taskDate: input.taskDate,
        startTime: input.startTime,
        endTime: input.endTime,
        title: input.title,
        isDone: input.isDone,
      });
    }

    const title = input.title.trim();
    if (!title) throw new Error('任务名不能为空');

    const startRes = parseTimePart(input.startTime);
    if (!startRes.ok) throw new Error(startRes.error);
    const endRes = parseTimePart(input.endTime);
    if (!endRes.ok) throw new Error(endRes.error);
    if (endRes.minutes <= startRes.minutes) {
      throw new Error('结束时间必须晚于起始时间，且不支持跨天');
    }

    const db = readLocalDb();
    const now = new Date().toISOString();
    const existingIdx = input.id ? db.dailyTask.findIndex((t) => t.id === input.id) : -1;

    if (existingIdx !== -1) {
      const updated: DailyTask = {
        ...db.dailyTask[existingIdx],
        taskDate: input.taskDate,
        startTime: startRes.normalized,
        endTime: endRes.normalized,
        title,
        isDone: input.isDone,
        updatedAt: now,
      };
      db.dailyTask[existingIdx] = updated;
      writeLocalDb(db);
      return updated;
    }

    const created: DailyTask = {
      id: input.id ?? createUuid(),
      taskDate: input.taskDate,
      startTime: startRes.normalized,
      endTime: endRes.normalized,
      title,
      isDone: input.isDone,
      createdAt: now,
      updatedAt: now,
    };
    db.dailyTask.push(created);
    writeLocalDb(db);
    return created;
  },

  async deleteTask(id: string): Promise<void> {
    if (isTauriRuntime()) {
      return invoke<void>('delete_task', { id });
    }
    const db = readLocalDb();
    db.dailyTask = db.dailyTask.filter((t) => t.id !== id);
    writeLocalDb(db);
  },

  async upsertMemo(input: UpsertMemoInput): Promise<DailyMemo> {
    if (isTauriRuntime()) {
      return invoke<DailyMemo>('upsert_memo', {
        id: input.id ?? null,
        memoDate: input.memoDate,
        content: input.content,
        sortOrder: input.sortOrder ?? null,
      });
    }

    const content = input.content.trim();
    if (!content) throw new Error('备忘内容不能为空');

    const db = readLocalDb();
    const now = new Date().toISOString();
    const existingIdx = input.id ? db.dailyMemo.findIndex((m) => m.id === input.id) : -1;

    if (existingIdx !== -1) {
      const updated: DailyMemo = {
        ...db.dailyMemo[existingIdx],
        memoDate: input.memoDate,
        content,
        sortOrder: input.sortOrder ?? db.dailyMemo[existingIdx].sortOrder,
        updatedAt: now,
      };
      db.dailyMemo[existingIdx] = updated;
      writeLocalDb(db);
      return updated;
    }

    const maxOrder = db.dailyMemo
      .filter((m) => m.memoDate === input.memoDate)
      .reduce((max, m) => Math.max(max, m.sortOrder), -1);

    const created: DailyMemo = {
      id: input.id ?? createUuid(),
      memoDate: input.memoDate,
      content,
      sortOrder: input.sortOrder ?? maxOrder + 1,
      createdAt: now,
      updatedAt: now,
    };
    db.dailyMemo.push(created);
    writeLocalDb(db);
    return created;
  },

  async deleteMemo(id: string): Promise<void> {
    if (isTauriRuntime()) {
      return invoke<void>('delete_memo', { id });
    }
    const db = readLocalDb();
    db.dailyMemo = db.dailyMemo.filter((m) => m.id !== id);
    writeLocalDb(db);
  },

  async getSettings(): Promise<AppSettings> {
    if (isTauriRuntime()) {
      return invoke<AppSettings>('get_settings');
    }
    return readLocalSettings();
  },

  async updateDataDir(newDir: string): Promise<AppSettings> {
    if (isTauriRuntime()) {
      return invoke<AppSettings>('update_data_dir', { newDir });
    }
    const trimmed = newDir.trim().replace(/\/+$/, '');
    if (!trimmed) throw new Error('数据目录路径不能为空');
    const next: AppSettings = {
      dataDir: trimmed,
      dbPath: `${trimmed}/data.sqlite`,
      exportsDir: `${trimmed}/exports`,
      schemaVersion: 1,
    };
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    }
    return next;
  },

  async exportWeekMarkdown(weekStart: string): Promise<{ path?: string; content: string }> {
    const week = await this.getWeek(weekStart);
    const content = generateWeekMarkdown(week);
    if (isTauriRuntime()) {
      const path = await invoke<string>('export_week_markdown', { weekStart });
      return { path, content };
    }
    return { content };
  },

  async exportJsonBackup(): Promise<{ path?: string; payload: BackupPayload }> {
    if (isTauriRuntime()) {
      const [path, payload] = await invoke<[string, BackupPayload]>('export_json_backup');
      return { path, payload };
    }
    const db = readLocalDb();
    const payload: BackupPayload = {
      exportedAt: new Date().toISOString(),
      schemaVersion: 1,
      weeklyFocus: db.weeklyFocus,
      dailyTask: db.dailyTask,
      dailyMemo: db.dailyMemo,
    };
    return { payload };
  },

  async restoreJsonBackup(payload: BackupPayload): Promise<void> {
    if (
      !payload ||
      !Array.isArray(payload.weeklyFocus) ||
      !Array.isArray(payload.dailyTask) ||
      !Array.isArray(payload.dailyMemo)
    ) {
      throw new Error('JSON 备份格式无效，缺少 weeklyFocus / dailyTask / dailyMemo 字段');
    }
    if (isTauriRuntime()) {
      return invoke<void>('restore_json_backup', { payload });
    }
    writeLocalDb({
      weeklyFocus: payload.weeklyFocus,
      dailyTask: payload.dailyTask,
      dailyMemo: payload.dailyMemo,
    });
  },
};
