import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import {
  addDays,
  addWeeks,
  getWeekDates,
  isWeekendDate,
  todayStr,
  weekStartOf,
} from '@/core/dateUtils';
import { generateWeekMarkdown } from '@/core/markdownExport';
import {
  scheduleApi,
  type UpsertFocusInput,
  type UpsertMemoInput,
  type UpsertTaskInput,
} from '@/services/scheduleApi';
import type {
  AppSettings,
  BackupPayload,
  DailyMemo,
  DailyTask,
  PendingDeleteItem,
  ToastNotice,
  ViewMode,
  WeekBundle,
  WeeklyFocus,
} from '@/types/schedule';

const UNDO_WINDOW_MS = 5000;
const MAX_FUTURE_WEEKS = 1;
const PREF_HIDE_WEEKENDS_KEY = 'local_schedule_pref_hide_weekends';

function maxAllowedWeekStart(): string {
  return addWeeks(weekStartOf(todayStr()), MAX_FUTURE_WEEKS);
}

function buildDefaultWeekWindow(centerWeekStart: string): string[] {
  const maxWeek = maxAllowedWeekStart();
  const center = centerWeekStart > maxWeek ? maxWeek : centerWeekStart;
  const next = addWeeks(center, 1);
  const prev = addWeeks(center, -1);
  const result: string[] = [];
  if (next <= maxWeek) {
    result.push(next);
  }
  result.push(center, prev);
  return result;
}

function readHideWeekendsPref(): boolean {
  try {
    if (typeof localStorage === 'undefined') return true;
    const raw = localStorage.getItem(PREF_HIDE_WEEKENDS_KEY);
    return raw === null ? true : raw === 'true';
  } catch {
    return true;
  }
}

export const useScheduleStore = defineStore('schedule', () => {
  const initialToday = todayStr();
  const initialWeek = weekStartOf(initialToday);

  const viewMode = ref<ViewMode>('week');
  const selectedDate = ref<string>(initialToday);
  const activeWeekStart = ref<string>(initialWeek);
  const currentWeekStart = computed(() => activeWeekStart.value);

  const visibleWeekStarts = ref<string[]>(buildDefaultWeekWindow(initialWeek));
  const weeksByStart = ref<Record<string, WeekBundle>>({});
  const scrollToWeekSignal = ref<{ weekStart: string; seq: number } | null>(null);
  let scrollSeq = 0;

  const settings = ref<AppSettings>({
    dataDir: '~/Documents/本地日程',
    dbPath: '~/Documents/本地日程/data.sqlite',
    exportsDir: '~/Documents/本地日程/exports',
    schemaVersion: 1,
  });

  const loading = ref(false);
  const pendingDeletes = ref<PendingDeleteItem[]>([]);
  const toasts = ref<ToastNotice[]>([]);

  const hideWeekends = ref<boolean>(readHideWeekendsPref());
  const expandedWeekendWeeks = ref<Record<string, boolean>>({});

  const deleteTimers = new Map<string, ReturnType<typeof setTimeout>>();

  const weekData = computed(() => weeksByStart.value[activeWeekStart.value] ?? null);
  const weekDays = computed(() => getWeekDates(activeWeekStart.value, todayStr()));
  const canStepNext = computed(() => {
    const maxWeek = maxAllowedWeekStart();
    if (viewMode.value === 'week') {
      return activeWeekStart.value < maxWeek;
    }
    return selectedDate.value < addDays(maxWeek, 6);
  });

  function toggleHideWeekends(): void {
    hideWeekends.value = !hideWeekends.value;
    expandedWeekendWeeks.value = {};
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(PREF_HIDE_WEEKENDS_KEY, String(hideWeekends.value));
      }
    } catch {
      // ignore storage errors
    }
  }

  function isWeekWeekendExpanded(weekStart: string): boolean {
    if (!hideWeekends.value) return true;
    const override = expandedWeekendWeeks.value[weekStart];
    if (override !== undefined) return override;
    const today = todayStr();
    if (weekStartOf(today) === weekStart && isWeekendDate(today)) {
      return true;
    }
    return false;
  }

  function toggleWeekWeekend(weekStart: string): void {
    expandedWeekendWeeks.value = {
      ...expandedWeekendWeeks.value,
      [weekStart]: !isWeekWeekendExpanded(weekStart),
    };
  }

  function weekendItemCount(weekStart: string): number {
    const bundle = weeksByStart.value[weekStart];
    if (!bundle) return 0;
    const sat = addDays(weekStart, 5);
    const sun = addDays(weekStart, 6);
    const taskCount = bundle.tasks.filter((t) => t.taskDate === sat || t.taskDate === sun).length;
    const memoCount = bundle.memos.filter((m) => m.memoDate === sat || m.memoDate === sun).length;
    return taskCount + memoCount;
  }

  function focusesForWeek(weekStart: string): WeeklyFocus[] {
    const items = weeksByStart.value[weekStart]?.focuses ?? [];
    return [...items].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt)
    );
  }

  const focuses = computed(() => focusesForWeek(activeWeekStart.value));

  function tasksForDate(date: string): DailyTask[] {
    const weekStart = weekStartOf(date);
    const items = weeksByStart.value[weekStart]?.tasks ?? [];
    return items
      .filter((t) => t.taskDate === date)
      .sort(
        (a, b) =>
          a.sortOrder - b.sortOrder ||
          a.startTime.localeCompare(b.startTime) ||
          a.endTime.localeCompare(b.endTime) ||
          a.createdAt.localeCompare(b.createdAt)
      );
  }

  function memosForDate(date: string): DailyMemo[] {
    const weekStart = weekStartOf(date);
    const items = weeksByStart.value[weekStart]?.memos ?? [];
    return items
      .filter((m) => m.memoDate === date)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
  }

  const selectedDayTasks = computed(() => tasksForDate(selectedDate.value));
  const selectedDayMemos = computed(() => memosForDate(selectedDate.value));

  function markdownForWeek(weekStart: string): string {
    const bundle = weeksByStart.value[weekStart];
    if (!bundle) return '';
    return generateWeekMarkdown(bundle);
  }

  const currentWeekMarkdown = computed(() => markdownForWeek(activeWeekStart.value));

  function pushToast(message: string, tone: ToastNotice['tone'] = 'info'): void {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    toasts.value.push({ id, message, tone });
    setTimeout(() => {
      toasts.value = toasts.value.filter((t) => t.id !== id);
    }, 3200);
  }

  function triggerScrollToWeek(weekStart: string): void {
    scrollSeq += 1;
    scrollToWeekSignal.value = { weekStart, seq: scrollSeq };
  }

  async function loadWeek(dateInWeek = activeWeekStart.value): Promise<void> {
    const weekStart = weekStartOf(dateInWeek);
    const bundle = await scheduleApi.getWeek(weekStart);
    weeksByStart.value = {
      ...weeksByStart.value,
      [weekStart]: bundle,
    };
  }

  async function loadWeeks(weekStarts: string[]): Promise<void> {
    if (weekStarts.length === 0) return;
    loading.value = true;
    try {
      const bundles = await Promise.all(weekStarts.map((w) => scheduleApi.getWeek(w)));
      const nextMap = { ...weeksByStart.value };
      for (const bundle of bundles) {
        nextMap[bundle.weekStart] = bundle;
      }
      weeksByStart.value = nextMap;
    } catch (err) {
      pushToast(err instanceof Error ? err.message : '加载周数据失败', 'error');
    } finally {
      loading.value = false;
    }
  }

  async function init(): Promise<void> {
    await Promise.all([
      loadWeeks(visibleWeekStarts.value),
      scheduleApi
        .getSettings()
        .then((s) => {
          settings.value = s;
        })
        .catch(() => {}),
    ]);
    triggerScrollToWeek(activeWeekStart.value);
  }

  function setActiveWeek(weekStart: string): void {
    activeWeekStart.value = weekStartOf(weekStart);
  }

  async function loadEarlierWeeks(count = 2): Promise<void> {
    const last =
      visibleWeekStarts.value[visibleWeekStarts.value.length - 1] ?? activeWeekStart.value;
    const added: string[] = [];
    for (let i = 1; i <= count; i += 1) {
      added.push(addWeeks(last, -i));
    }
    visibleWeekStarts.value = [...visibleWeekStarts.value, ...added];
    await loadWeeks(added);
  }

  async function ensureWeekVisible(weekStart: string): Promise<void> {
    const maxWeek = maxAllowedWeekStart();
    const rawTarget = weekStartOf(weekStart);
    const target = rawTarget > maxWeek ? maxWeek : rawTarget;
    if (!visibleWeekStarts.value.includes(target)) {
      const first = visibleWeekStarts.value[0];
      const last = visibleWeekStarts.value[visibleWeekStarts.value.length - 1];
      if (first && target === addWeeks(first, 1) && target <= maxWeek) {
        visibleWeekStarts.value = [target, ...visibleWeekStarts.value];
      } else if (last && target === addWeeks(last, -1)) {
        visibleWeekStarts.value = [...visibleWeekStarts.value, target];
      } else {
        visibleWeekStarts.value = buildDefaultWeekWindow(target);
      }
    }
    const missing = visibleWeekStarts.value.filter((w) => !weeksByStart.value[w]);
    if (missing.length > 0) {
      await loadWeeks(missing);
    }
  }

  async function selectDate(date: string): Promise<void> {
    const maxDate = addDays(maxAllowedWeekStart(), 6);
    const clampedDate = date > maxDate ? maxDate : date;
    selectedDate.value = clampedDate;
    const targetWeek = weekStartOf(clampedDate);
    activeWeekStart.value = targetWeek;
    await ensureWeekVisible(targetWeek);
  }

  async function goToday(): Promise<void> {
    const today = todayStr();
    const todayWeek = weekStartOf(today);
    selectedDate.value = today;
    activeWeekStart.value = todayWeek;
    await ensureWeekVisible(todayWeek);
    triggerScrollToWeek(todayWeek);
  }

  async function stepPrev(): Promise<void> {
    if (viewMode.value === 'week') {
      const target = addWeeks(activeWeekStart.value, -1);
      activeWeekStart.value = target;
      selectedDate.value = target;
      await ensureWeekVisible(target);
      triggerScrollToWeek(target);
    } else {
      await selectDate(addDays(selectedDate.value, -1));
    }
  }

  async function stepNext(): Promise<void> {
    if (!canStepNext.value) return;
    if (viewMode.value === 'week') {
      const target = addWeeks(activeWeekStart.value, 1);
      activeWeekStart.value = target;
      selectedDate.value = target;
      await ensureWeekVisible(target);
      triggerScrollToWeek(target);
    } else {
      await selectDate(addDays(selectedDate.value, 1));
    }
  }

  async function openDayView(date: string): Promise<void> {
    await selectDate(date);
    viewMode.value = 'day';
  }

  function backToWeekView(): void {
    viewMode.value = 'week';
    triggerScrollToWeek(activeWeekStart.value);
  }

  function setViewMode(mode: ViewMode): void {
    viewMode.value = mode;
    if (mode === 'week') {
      triggerScrollToWeek(activeWeekStart.value);
    }
  }

  async function saveFocus(input: UpsertFocusInput): Promise<WeeklyFocus> {
    const saved = await scheduleApi.upsertFocus(input);
    const bucket = weeksByStart.value[saved.weekStart];
    if (bucket) {
      const idx = bucket.focuses.findIndex((f) => f.id === saved.id);
      if (idx !== -1) {
        bucket.focuses[idx] = saved;
      } else {
        bucket.focuses.push(saved);
      }
    } else {
      await loadWeek(saved.weekStart);
    }
    return saved;
  }

  async function toggleFocusDone(focus: WeeklyFocus): Promise<void> {
    await saveFocus({
      id: focus.id,
      weekStart: focus.weekStart,
      title: focus.title,
      targetText: focus.targetText,
      statusNote: focus.statusNote,
      isDone: !focus.isDone,
      sortOrder: focus.sortOrder,
    });
  }

  async function saveTask(input: UpsertTaskInput): Promise<DailyTask> {
    const saved = await scheduleApi.upsertTask(input);
    const weekStart = weekStartOf(saved.taskDate);
    if (!input.id || !weeksByStart.value[weekStart]) {
      await loadWeek(weekStart);
      return saved;
    }
    const bucket = weeksByStart.value[weekStart];
    const idx = bucket.tasks.findIndex((t) => t.id === saved.id);
    if (idx !== -1) {
      bucket.tasks[idx] = saved;
    } else {
      bucket.tasks.push(saved);
    }
    return saved;
  }

  async function toggleTaskDone(task: DailyTask): Promise<void> {
    await saveTask({
      id: task.id,
      taskDate: task.taskDate,
      startTime: task.startTime,
      endTime: task.endTime,
      title: task.title,
      isDone: !task.isDone,
      sortOrder: task.sortOrder,
    });
  }

  async function reorderFocuses(weekStart: string, orderedIds: string[]): Promise<void> {
    const bucket = weeksByStart.value[weekStart];
    if (bucket) {
      const orderMap = new Map(orderedIds.map((id, idx) => [id, idx]));
      for (const item of bucket.focuses) {
        const nextOrder = orderMap.get(item.id);
        if (nextOrder !== undefined) item.sortOrder = nextOrder;
      }
    }
    try {
      await scheduleApi.reorderItems('focus', orderedIds);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : '保存周重点排序失败', 'error');
      await loadWeek(weekStart);
    }
  }

  async function reorderTasks(date: string, orderedIds: string[]): Promise<void> {
    const weekStart = weekStartOf(date);
    const bucket = weeksByStart.value[weekStart];
    if (bucket) {
      const orderMap = new Map(orderedIds.map((id, idx) => [id, idx]));
      for (const item of bucket.tasks) {
        const nextOrder = orderMap.get(item.id);
        if (nextOrder !== undefined) item.sortOrder = nextOrder;
      }
    }
    try {
      await scheduleApi.reorderItems('task', orderedIds);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : '保存待办排序失败', 'error');
      await loadWeek(weekStart);
    }
  }

  async function reorderMemos(date: string, orderedIds: string[]): Promise<void> {
    const weekStart = weekStartOf(date);
    const bucket = weeksByStart.value[weekStart];
    if (bucket) {
      const orderMap = new Map(orderedIds.map((id, idx) => [id, idx]));
      for (const item of bucket.memos) {
        const nextOrder = orderMap.get(item.id);
        if (nextOrder !== undefined) item.sortOrder = nextOrder;
      }
    }
    try {
      await scheduleApi.reorderItems('memo', orderedIds);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : '保存备忘排序失败', 'error');
      await loadWeek(weekStart);
    }
  }

  async function saveMemo(input: UpsertMemoInput): Promise<DailyMemo> {
    const saved = await scheduleApi.upsertMemo(input);
    const weekStart = weekStartOf(saved.memoDate);
    const bucket = weeksByStart.value[weekStart];
    if (bucket) {
      const idx = bucket.memos.findIndex((m) => m.id === saved.id);
      if (idx !== -1) {
        bucket.memos[idx] = saved;
      } else {
        bucket.memos.push(saved);
      }
    } else {
      await loadWeek(weekStart);
    }
    return saved;
  }

  function schedulePendingDelete(entry: PendingDeleteItem): void {
    const timer = setTimeout(async () => {
      deleteTimers.delete(entry.pendingId);
      pendingDeletes.value = pendingDeletes.value.filter((p) => p.pendingId !== entry.pendingId);
      try {
        if (entry.kind === 'focus') {
          await scheduleApi.deleteFocus(entry.item.id);
        } else if (entry.kind === 'task') {
          await scheduleApi.deleteTask(entry.item.id);
        } else {
          await scheduleApi.deleteMemo(entry.item.id);
        }
      } catch (err) {
        pushToast(err instanceof Error ? err.message : '删除持久化失败', 'error');
        await loadWeeks(visibleWeekStarts.value);
      }
    }, UNDO_WINDOW_MS);

    deleteTimers.set(entry.pendingId, timer);
    pendingDeletes.value.push(entry);
  }

  function requestDeleteFocus(focus: WeeklyFocus): void {
    const bucket = weeksByStart.value[focus.weekStart];
    if (bucket) {
      bucket.focuses = bucket.focuses.filter((f) => f.id !== focus.id);
    }
    schedulePendingDelete({
      pendingId: `del-focus-${focus.id}-${Date.now()}`,
      kind: 'focus',
      label: focus.title,
      item: focus,
      expiresAt: Date.now() + UNDO_WINDOW_MS,
    });
  }

  function requestDeleteTask(task: DailyTask): void {
    const bucket = weeksByStart.value[weekStartOf(task.taskDate)];
    if (bucket) {
      bucket.tasks = bucket.tasks.filter((t) => t.id !== task.id);
    }
    schedulePendingDelete({
      pendingId: `del-task-${task.id}-${Date.now()}`,
      kind: 'task',
      label: `${task.startTime}-${task.endTime} ${task.title}`,
      item: task,
      expiresAt: Date.now() + UNDO_WINDOW_MS,
    });
  }

  function requestDeleteMemo(memo: DailyMemo): void {
    const bucket = weeksByStart.value[weekStartOf(memo.memoDate)];
    if (bucket) {
      bucket.memos = bucket.memos.filter((m) => m.id !== memo.id);
    }
    schedulePendingDelete({
      pendingId: `del-memo-${memo.id}-${Date.now()}`,
      kind: 'memo',
      label: memo.content,
      item: memo,
      expiresAt: Date.now() + UNDO_WINDOW_MS,
    });
  }

  function undoDelete(pendingId: string): void {
    const entry = pendingDeletes.value.find((p) => p.pendingId === pendingId);
    if (!entry) return;

    const timer = deleteTimers.get(pendingId);
    if (timer) {
      clearTimeout(timer);
      deleteTimers.delete(pendingId);
    }
    pendingDeletes.value = pendingDeletes.value.filter((p) => p.pendingId !== pendingId);

    if (entry.kind === 'focus') {
      weeksByStart.value[entry.item.weekStart]?.focuses.push(entry.item);
    } else if (entry.kind === 'task') {
      weeksByStart.value[weekStartOf(entry.item.taskDate)]?.tasks.push(entry.item);
    } else {
      weeksByStart.value[weekStartOf(entry.item.memoDate)]?.memos.push(entry.item);
    }
    pushToast('已撤销删除', 'success');
  }

  async function flushPendingDeletes(): Promise<void> {
    if (pendingDeletes.value.length === 0) return;
    const queued = [...pendingDeletes.value];
    pendingDeletes.value = [];
    for (const entry of queued) {
      const timer = deleteTimers.get(entry.pendingId);
      if (timer) {
        clearTimeout(timer);
        deleteTimers.delete(entry.pendingId);
      }
      if (entry.kind === 'focus') {
        await scheduleApi.deleteFocus(entry.item.id);
      } else if (entry.kind === 'task') {
        await scheduleApi.deleteTask(entry.item.id);
      } else {
        await scheduleApi.deleteMemo(entry.item.id);
      }
    }
  }

  async function updateDataDir(newDir: string): Promise<AppSettings> {
    const updated = await scheduleApi.updateDataDir(newDir);
    settings.value = updated;
    pushToast('数据目录已更新', 'success');
    return updated;
  }

  async function exportCurrentWeekMarkdown(weekStart = activeWeekStart.value): Promise<{
    path?: string;
    content: string;
  }> {
    await flushPendingDeletes();
    return scheduleApi.exportWeekMarkdown(weekStart);
  }

  async function exportJsonBackup(): Promise<{ path?: string; payload: BackupPayload }> {
    await flushPendingDeletes();
    return scheduleApi.exportJsonBackup();
  }

  async function restoreJsonBackup(payload: BackupPayload): Promise<void> {
    for (const [id, timer] of deleteTimers.entries()) {
      clearTimeout(timer);
      deleteTimers.delete(id);
    }
    pendingDeletes.value = [];

    await scheduleApi.restoreJsonBackup(payload);
    await loadWeeks(visibleWeekStarts.value);
    pushToast('已从 JSON 备份恢复全部数据', 'success');
  }

  return {
    viewMode,
    selectedDate,
    activeWeekStart,
    currentWeekStart,
    visibleWeekStarts,
    weeksByStart,
    scrollToWeekSignal,
    weekData,
    weekDays,
    focuses,
    selectedDayTasks,
    selectedDayMemos,
    currentWeekMarkdown,
    settings,
    loading,
    pendingDeletes,
    toasts,
    hideWeekends,
    canStepNext,
    toggleHideWeekends,
    isWeekWeekendExpanded,
    toggleWeekWeekend,
    weekendItemCount,
    focusesForWeek,
    tasksForDate,
    memosForDate,
    markdownForWeek,
    pushToast,
    init,
    loadWeek,
    loadWeeks,
    loadEarlierWeeks,
    setActiveWeek,
    selectDate,
    goToday,
    stepPrev,
    stepNext,
    openDayView,
    backToWeekView,
    setViewMode,
    saveFocus,
    toggleFocusDone,
    requestDeleteFocus,
    reorderFocuses,
    saveTask,
    toggleTaskDone,
    requestDeleteTask,
    reorderTasks,
    saveMemo,
    requestDeleteMemo,
    reorderMemos,
    undoDelete,
    updateDataDir,
    exportCurrentWeekMarkdown,
    exportJsonBackup,
    restoreJsonBackup,
  };
});
