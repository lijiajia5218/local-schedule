import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { addDays, addWeeks, todayStr, weekStartOf } from '@/core/dateUtils';
import { useScheduleStore } from '@/stores/scheduleStore';

function installMemoryLocalStorage() {
  const map = new Map<string, string>();
  const stub = {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? (map.get(key) ?? null) : null;
    },
    key(index: number) {
      return Array.from(map.keys())[index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: stub,
    configurable: true,
    writable: true,
  });
}

describe('scheduleStore MVP flows', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    setActivePinia(createPinia());
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads multi-week window in descending order (future on top, past on bottom)', async () => {
    const store = useScheduleStore();
    await store.init();

    const current = weekStartOf(todayStr());
    expect(store.visibleWeekStarts).toEqual([
      addWeeks(current, 2),
      addWeeks(current, 1),
      current,
      addWeeks(current, -1),
    ]);

    await store.loadLaterWeeks(2);
    expect(store.visibleWeekStarts[0]).toBe(addWeeks(current, 4));
    expect(store.visibleWeekStarts[1]).toBe(addWeeks(current, 3));

    await store.loadEarlierWeeks(2);
    const lastIdx = store.visibleWeekStarts.length - 1;
    expect(store.visibleWeekStarts[lastIdx - 1]).toBe(addWeeks(current, -2));
    expect(store.visibleWeekStarts[lastIdx]).toBe(addWeeks(current, -3));
  });

  it('sorts daily tasks by startTime and supports Saturday and Sunday identically', async () => {
    const store = useScheduleStore();
    await store.init();

    const current = weekStartOf(todayStr());
    const sunday = addDays(current, 6);

    await store.saveTask({
      taskDate: sunday,
      startTime: '21:00',
      endTime: '22:00',
      title: '周日晚总结',
      isDone: false,
    });
    await store.saveTask({
      taskDate: sunday,
      startTime: '08:30',
      endTime: '09:30',
      title: '周日晨读',
      isDone: false,
    });

    const sundayTasks = store.tasksForDate(sunday);
    expect(sundayTasks.map((t) => `${t.startTime} ${t.title}`)).toEqual([
      '08:30 周日晨读',
      '19:30 梳理下周重点待办清单',
      '21:00 周日晚总结',
    ]);
  });

  it('supports CRUD & toggle on weekly focuses and daily memos', async () => {
    const store = useScheduleStore();
    await store.init();

    const current = weekStartOf(todayStr());
    const createdFocus = await store.saveFocus({
      weekStart: current,
      title: 'MVP 里程碑验收',
      targetText: '本周五',
      statusNote: '待确认',
      isDone: false,
    });

    await store.toggleFocusDone(createdFocus);
    const updatedFocus = store.focusesForWeek(current).find((f) => f.id === createdFocus.id);
    expect(updatedFocus?.isDone).toBe(true);

    const saturday = addDays(current, 5);
    const memo = await store.saveMemo({ memoDate: saturday, content: '周末补充记录' });
    await store.saveMemo({
      id: memo.id,
      memoDate: saturday,
      content: '周末补充记录（已更新）',
      sortOrder: memo.sortOrder,
    });
    expect(store.memosForDate(saturday).some((m) => m.content === '周末补充记录（已更新）')).toBe(
      true
    );
  });

  it('handles 5-second undo window and commits permanent delete after expiry', async () => {
    const store = useScheduleStore();
    await store.init();

    const current = weekStartOf(todayStr());
    const task = await store.saveTask({
      taskDate: current,
      startTime: '11:00',
      endTime: '12:00',
      title: '临时待删除任务',
      isDone: false,
    });

    store.requestDeleteTask(task);
    expect(store.tasksForDate(current).some((t) => t.id === task.id)).toBe(false);
    expect(store.pendingDeletes).toHaveLength(1);

    // Undo within 5 seconds
    store.undoDelete(store.pendingDeletes[0].pendingId);
    expect(store.tasksForDate(current).some((t) => t.id === task.id)).toBe(true);
    expect(store.pendingDeletes).toHaveLength(0);

    // Delete again and let 5 seconds expire
    store.requestDeleteTask(task);
    await vi.advanceTimersByTimeAsync(5100);
    expect(store.pendingDeletes).toHaveLength(0);

    await store.loadWeek(current);
    expect(store.tasksForDate(current).some((t) => t.id === task.id)).toBe(false);
  });

  it('flushes pending deletes before Markdown/JSON export and restores JSON backup cleanly', async () => {
    const store = useScheduleStore();
    await store.init();

    const current = weekStartOf(todayStr());
    const friday = addDays(current, 4);
    const tempTask = await store.saveTask({
      taskDate: friday,
      startTime: '18:00',
      endTime: '19:00',
      title: '待导出前删除的任务',
      isDone: false,
    });

    const backupBeforeDelete = await store.exportJsonBackup();
    expect(backupBeforeDelete.payload.dailyTask.some((t) => t.id === tempTask.id)).toBe(true);

    // Delete and immediately export Markdown before 5s elapses
    store.requestDeleteTask(tempTask);
    const mdRes = await store.exportCurrentWeekMarkdown(current);
    expect(mdRes.content).not.toContain('待导出前删除的任务');
    expect(store.pendingDeletes).toHaveLength(0);

    // Restore full JSON backup and confirm deleted task comes back
    await store.restoreJsonBackup(backupBeforeDelete.payload);
    expect(store.tasksForDate(friday).some((t) => t.id === tempTask.id)).toBe(true);
  });
});
