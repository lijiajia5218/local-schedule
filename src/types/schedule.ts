export type ViewMode = 'week' | 'day';

export interface WeeklyFocus {
  id: string;
  weekStart: string;
  title: string;
  targetText: string | null;
  statusNote: string | null;
  isDone: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface DailyTask {
  id: string;
  taskDate: string;
  startTime: string;
  endTime: string;
  title: string;
  isDone: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface DailyMemo {
  id: string;
  memoDate: string;
  content: string;
  reminderTime: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface WeekBundle {
  weekStart: string;
  weekEnd: string;
  focuses: WeeklyFocus[];
  tasks: DailyTask[];
  memos: DailyMemo[];
}

export interface DayBundle {
  date: string;
  tasks: DailyTask[];
  memos: DailyMemo[];
}

export interface AppSettings {
  dataDir: string;
  dbPath: string;
  exportsDir: string;
  schemaVersion: number;
  reminderLeadMinutes: number;
  closeToTray: boolean;
}

export interface BackupPayload {
  exportedAt: string;
  schemaVersion: number;
  weeklyFocus: WeeklyFocus[];
  dailyTask: DailyTask[];
  dailyMemo: DailyMemo[];
}

export type ParseTimeResult =
  | {
      ok: true;
      startTime: string;
      endTime: string;
      startMinutes: number;
      endMinutes: number;
    }
  | {
      ok: false;
      error: string;
    };

export type ParseShorthandResult =
  | {
      ok: true;
      startTime: string;
      endTime: string;
      title: string;
      isDone: boolean;
    }
  | {
      ok: false;
      error: string;
      raw: string;
    };

export type ParseMemoResult =
  | {
      ok: true;
      content: string;
      reminderTime: string | null;
    }
  | {
      ok: false;
      error: string;
      raw: string;
    };

export type ParseWeeklyFocusResult =
  | {
      ok: true;
      title: string;
      targetText: string | null;
      statusNote: string | null;
      isDone: boolean;
    }
  | {
      ok: false;
      error: string;
      raw: string;
    };

export type PendingDeleteItem =
  | {
      pendingId: string;
      kind: 'focus';
      label: string;
      item: WeeklyFocus;
      expiresAt: number;
    }
  | {
      pendingId: string;
      kind: 'task';
      label: string;
      item: DailyTask;
      expiresAt: number;
    }
  | {
      pendingId: string;
      kind: 'memo';
      label: string;
      item: DailyMemo;
      expiresAt: number;
    };

export interface ToastNotice {
  id: string;
  message: string;
  tone: 'info' | 'success' | 'error';
}
