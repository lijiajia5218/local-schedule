<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import {
  ArrowLeft,
  Check,
  Clock,
  Pencil,
  StickyNote,
  Trash2,
} from 'lucide-vue-next';
import { formatFullDayLabel, isWeekendDate, todayStr } from '@/core/dateUtils';
import {
  classifyQuickLine,
  formatDailyMemoLine,
  formatDailyTaskLine,
  isBlankOrBarePrefix,
  parseShorthandTask,
} from '@/core/timeParser';
import { useScheduleStore } from '@/stores/scheduleStore';
import type { DailyMemo, DailyTask } from '@/types/schedule';

const store = useScheduleStore();

const isToday = computed(() => store.selectedDate === todayStr());
const isWeekend = computed(() => isWeekendDate(store.selectedDate));
const fullDateTitle = computed(() => formatFullDayLabel(store.selectedDate));

const tasks = computed(() => store.selectedDayTasks);
const memos = computed(() => store.selectedDayMemos);
const doneCount = computed(() => tasks.value.filter((t) => t.isDone).length);

const isTaskInlineOpen = ref(false);
const taskInlineDraft = ref('');
const taskInlineError = ref('');
const taskInlineRef = ref<HTMLInputElement | null>(null);

const editingTaskId = ref<string | null>(null);
const editTaskDraft = ref('');
const editTaskError = ref('');
const editTaskRef = ref<HTMLInputElement | HTMLInputElement[] | null>(null);

const isMemoInlineOpen = ref(false);
const newMemoText = ref('');
const newMemoError = ref('');
const memoInlineRef = ref<HTMLInputElement | null>(null);

const editingMemoId = ref<string | null>(null);
const editMemoText = ref('');
const editMemoError = ref('');
const editMemoRef = ref<HTMLInputElement | HTMLInputElement[] | null>(null);

function focusElAtEnd(el: HTMLInputElement | null): void {
  if (!el) return;
  el.focus();
  const len = el.value.length;
  el.setSelectionRange(len, len);
}

function resolveArrayRef(r: HTMLInputElement | HTMLInputElement[] | null): HTMLInputElement | null {
  return Array.isArray(r) ? (r[0] ?? null) : r;
}

async function openTaskInline(): Promise<void> {
  if (editingTaskId.value) return;
  isTaskInlineOpen.value = true;
  taskInlineDraft.value = '【】';
  taskInlineError.value = '';
  await nextTick();
  focusElAtEnd(taskInlineRef.value);
}

function closeTaskInline(): void {
  isTaskInlineOpen.value = false;
  taskInlineDraft.value = '';
  taskInlineError.value = '';
}

async function commitTaskInline(keepOpen: boolean): Promise<void> {
  if (isBlankOrBarePrefix(taskInlineDraft.value)) {
    closeTaskInline();
    return;
  }

  const parsed = parseShorthandTask(taskInlineDraft.value);
  if (!parsed.ok) {
    taskInlineError.value = parsed.error;
    return;
  }

  await store.saveTask({
    taskDate: store.selectedDate,
    startTime: parsed.startTime,
    endTime: parsed.endTime,
    title: parsed.title,
    isDone: parsed.isDone,
  });

  taskInlineError.value = '';
  if (keepOpen) {
    taskInlineDraft.value = '【】';
    await nextTick();
    focusElAtEnd(taskInlineRef.value);
  } else {
    closeTaskInline();
  }
}

async function handleTaskInlineEnter(): Promise<void> {
  await commitTaskInline(true);
}

async function handleTaskInlineBlur(): Promise<void> {
  if (!isTaskInlineOpen.value) return;
  await commitTaskInline(false);
}

async function startEditTask(task: DailyTask): Promise<void> {
  closeTaskInline();
  editingTaskId.value = task.id;
  editTaskDraft.value = formatDailyTaskLine(task);
  editTaskError.value = '';
  await nextTick();
  focusElAtEnd(resolveArrayRef(editTaskRef.value));
}

function cancelEditTask(): void {
  editingTaskId.value = null;
  editTaskDraft.value = '';
  editTaskError.value = '';
}

async function handleEditTaskEnter(task: DailyTask): Promise<void> {
  if (editingTaskId.value !== task.id) return;
  if (isBlankOrBarePrefix(editTaskDraft.value)) {
    cancelEditTask();
    store.requestDeleteTask(task);
    return;
  }

  const parsed = parseShorthandTask(editTaskDraft.value);
  if (!parsed.ok) {
    editTaskError.value = parsed.error;
    return;
  }

  await store.saveTask({
    id: task.id,
    taskDate: task.taskDate,
    startTime: parsed.startTime,
    endTime: parsed.endTime,
    title: parsed.title,
    isDone: parsed.isDone,
  });
  cancelEditTask();
}

async function handleEditTaskBlur(task: DailyTask): Promise<void> {
  if (editingTaskId.value !== task.id) return;
  if (isBlankOrBarePrefix(editTaskDraft.value)) {
    cancelEditTask();
    return;
  }

  const parsed = parseShorthandTask(editTaskDraft.value);
  if (!parsed.ok) {
    editTaskError.value = parsed.error;
    return;
  }

  await store.saveTask({
    id: task.id,
    taskDate: task.taskDate,
    startTime: parsed.startTime,
    endTime: parsed.endTime,
    title: parsed.title,
    isDone: parsed.isDone,
  });
  cancelEditTask();
}

async function openMemoInline(): Promise<void> {
  if (editingMemoId.value) return;
  isMemoInlineOpen.value = true;
  newMemoText.value = '- ';
  newMemoError.value = '';
  await nextTick();
  focusElAtEnd(memoInlineRef.value);
}

function closeMemoInline(): void {
  isMemoInlineOpen.value = false;
  newMemoText.value = '';
  newMemoError.value = '';
}

async function commitNewMemo(keepOpen: boolean): Promise<void> {
  if (isBlankOrBarePrefix(newMemoText.value)) {
    closeMemoInline();
    return;
  }

  const res = classifyQuickLine(newMemoText.value);
  if (res.kind === 'empty') {
    closeMemoInline();
    return;
  }

  if (res.kind === 'memo') {
    await store.saveMemo({
      memoDate: store.selectedDate,
      content: res.content,
    });
  } else if (res.kind === 'task' && res.parsed.ok) {
    await store.saveTask({
      taskDate: store.selectedDate,
      startTime: res.parsed.startTime,
      endTime: res.parsed.endTime,
      title: res.parsed.title,
      isDone: res.parsed.isDone,
    });
  } else {
    newMemoError.value =
      res.kind === 'invalid'
        ? res.error
        : res.kind === 'task' && !res.parsed.ok
          ? res.parsed.error
          : '请以「- 」开头记录备忘';
    return;
  }

  newMemoError.value = '';
  if (keepOpen) {
    newMemoText.value = '- ';
    await nextTick();
    focusElAtEnd(memoInlineRef.value);
  } else {
    closeMemoInline();
  }
}

async function handleMemoInlineEnter(): Promise<void> {
  await commitNewMemo(true);
}

async function handleMemoInlineBlur(): Promise<void> {
  if (!isMemoInlineOpen.value) return;
  await commitNewMemo(false);
}

async function startEditMemo(memo: DailyMemo): Promise<void> {
  closeMemoInline();
  editingMemoId.value = memo.id;
  editMemoText.value = formatDailyMemoLine(memo);
  editMemoError.value = '';
  await nextTick();
  focusElAtEnd(resolveArrayRef(editMemoRef.value));
}

function cancelEditMemo(): void {
  editingMemoId.value = null;
  editMemoText.value = '';
  editMemoError.value = '';
}

async function handleEditMemoEnter(memo: DailyMemo): Promise<void> {
  if (editingMemoId.value !== memo.id) return;
  if (isBlankOrBarePrefix(editMemoText.value)) {
    cancelEditMemo();
    store.requestDeleteMemo(memo);
    return;
  }

  const content = editMemoText.value.trim().replace(/^[-－]\s*/, '').trim();
  if (!content) {
    cancelEditMemo();
    store.requestDeleteMemo(memo);
    return;
  }

  await store.saveMemo({
    id: memo.id,
    memoDate: memo.memoDate,
    content,
    sortOrder: memo.sortOrder,
  });
  cancelEditMemo();
}

async function handleEditMemoBlur(memo: DailyMemo): Promise<void> {
  if (editingMemoId.value !== memo.id) return;
  if (isBlankOrBarePrefix(editMemoText.value)) {
    cancelEditMemo();
    return;
  }

  const content = editMemoText.value.trim().replace(/^[-－]\s*/, '').trim();
  if (!content) {
    cancelEditMemo();
    return;
  }

  await store.saveMemo({
    id: memo.id,
    memoDate: memo.memoDate,
    content,
    sortOrder: memo.sortOrder,
  });
  cancelEditMemo();
}
</script>

<template>
  <div class="day-view-wrap">
    <div class="day-view">
      <div class="day-subheader">
        <button type="button" class="btn" @click="store.backToWeekView()">
          <ArrowLeft :size="14" />
          <span>返回周视图</span>
        </button>

        <div class="day-title-row">
          <h1 class="day-title tabular-nums">{{ fullDateTitle }}</h1>
          <span v-if="isToday" class="tag-today">今天</span>
          <span v-if="isWeekend" class="tag-weekend">周末</span>
        </div>

        <div v-if="tasks.length > 0" class="progress-text tabular-nums">
          已完成 {{ doneCount }}/{{ tasks.length }}
        </div>
      </div>

      <!-- 时间段任务卡片：点击空白处直接文档式输入 -->
      <section class="card" aria-label="时间段任务" @click="openTaskInline()">
        <div class="card-head" @click.stop="openTaskInline()">
          <div class="card-title">
            <Clock :size="15" />
            <span>时间段任务</span>
          </div>
          <span v-if="tasks.length > 0" class="memo-count tabular-nums">{{ tasks.length }} 项</span>
        </div>

        <ul v-if="tasks.length > 0" class="day-task-list">
          <li
            v-for="task in tasks"
            :key="task.id"
            class="day-task-row"
            :class="{ 'is-done': task.isDone, 'is-editing': editingTaskId === task.id }"
            @click.stop
          >
            <div v-if="editingTaskId === task.id" class="doc-compose full-edit-wrap">
              <input
                ref="editTaskRef"
                v-model="editTaskDraft"
                type="text"
                class="doc-input"
                :class="{ 'has-error': Boolean(editTaskError) }"
                placeholder="【】9-10｜任务"
                @input="editTaskError = ''"
                @keydown.enter.prevent="handleEditTaskEnter(task)"
                @keydown.esc.stop="cancelEditTask()"
                @blur="handleEditTaskBlur(task)"
              />
              <p v-if="editTaskError" class="doc-err">{{ editTaskError }}</p>
            </div>

            <template v-else>
              <button
                type="button"
                class="check-box"
                :class="{ checked: task.isDone }"
                :aria-label="task.isDone ? '取消完成' : '标记完成'"
                @click.stop="store.toggleTaskDone(task)"
              >
                <Check v-if="task.isDone" :size="11" :stroke-width="3" />
              </button>

              <span class="time-badge tabular-nums">
                {{ task.startTime }} - {{ task.endTime }}
              </span>

              <span class="task-name" @dblclick.stop="startEditTask(task)">
                {{ task.title }}
              </span>

              <div class="row-actions">
                <button
                  type="button"
                  class="icon-btn"
                  title="编辑"
                  @click.stop="startEditTask(task)"
                >
                  <Pencil :size="13" />
                </button>
                <button
                  type="button"
                  class="icon-btn danger"
                  title="删除"
                  @click.stop="store.requestDeleteTask(task)"
                >
                  <Trash2 :size="13" />
                </button>
              </div>
            </template>
          </li>
        </ul>

        <div v-if="isTaskInlineOpen" class="doc-compose" @click.stop>
          <input
            ref="taskInlineRef"
            v-model="taskInlineDraft"
            type="text"
            class="doc-input"
            :class="{ 'has-error': Boolean(taskInlineError) }"
            placeholder="【】9-10｜周会"
            @input="taskInlineError = ''"
            @keydown.enter.prevent="handleTaskInlineEnter()"
            @keydown.esc.stop="closeTaskInline()"
            @blur="handleTaskInlineBlur()"
          />
          <p v-if="taskInlineError" class="doc-err">{{ taskInlineError }}</p>
        </div>

        <div v-else class="ghost-entry">
          【】9-10｜任务
        </div>
      </section>

      <!-- 日备忘卡片：点击空白处直接文档式输入 -->
      <section class="card" aria-label="日备忘" @click="openMemoInline()">
        <div class="card-head" @click.stop="openMemoInline()">
          <div class="card-title">
            <StickyNote :size="15" />
            <span>日备忘</span>
          </div>
          <span class="memo-count tabular-nums">{{ memos.length }} 条</span>
        </div>

        <ul v-if="memos.length > 0" class="day-memo-list">
          <li
            v-for="memo in memos"
            :key="memo.id"
            class="day-memo-row"
            :class="{ 'is-editing': editingMemoId === memo.id }"
            @click.stop
          >
            <div v-if="editingMemoId === memo.id" class="doc-compose full-edit-wrap">
              <input
                ref="editMemoRef"
                v-model="editMemoText"
                type="text"
                class="doc-input"
                :class="{ 'has-error': Boolean(editMemoError) }"
                placeholder="- 备忘内容"
                @input="editMemoError = ''"
                @keydown.enter.prevent="handleEditMemoEnter(memo)"
                @keydown.esc.stop="cancelEditMemo()"
                @blur="handleEditMemoBlur(memo)"
              />
              <p v-if="editMemoError" class="doc-err">{{ editMemoError }}</p>
            </div>

            <template v-else>
              <span class="bullet">•</span>
              <span class="memo-content" @dblclick.stop="startEditMemo(memo)">
                {{ memo.content }}
              </span>
              <div class="row-actions">
                <button
                  type="button"
                  class="icon-btn"
                  title="编辑"
                  @click.stop="startEditMemo(memo)"
                >
                  <Pencil :size="13" />
                </button>
                <button
                  type="button"
                  class="icon-btn danger"
                  title="删除"
                  @click.stop="store.requestDeleteMemo(memo)"
                >
                  <Trash2 :size="13" />
                </button>
              </div>
            </template>
          </li>
        </ul>

        <div v-if="isMemoInlineOpen" class="doc-compose" @click.stop>
          <input
            ref="memoInlineRef"
            v-model="newMemoText"
            type="text"
            class="doc-input"
            :class="{ 'has-error': Boolean(newMemoError) }"
            placeholder="- 备忘内容"
            @input="newMemoError = ''"
            @keydown.enter.prevent="handleMemoInlineEnter()"
            @keydown.esc.stop="closeMemoInline()"
            @blur="handleMemoInlineBlur()"
          />
          <p v-if="newMemoError" class="doc-err">{{ newMemoError }}</p>
        </div>

        <div v-else class="ghost-entry">
          - 备忘
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.day-view-wrap {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 18px 24px 32px;
}

.day-view {
  max-width: 860px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.day-subheader {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

.day-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.day-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--text-primary);
}

.tag-today {
  font-size: 11.5px;
  font-weight: 600;
  padding: 2px 9px;
  border-radius: var(--radius-pill);
  background: var(--accent);
  color: #ffffff;
}

.tag-weekend {
  font-size: 11.5px;
  font-weight: 500;
  padding: 2px 9px;
  border-radius: var(--radius-pill);
  background: var(--bg-muted);
  color: var(--text-secondary);
}

.progress-text {
  margin-left: auto;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-tertiary);
}

.card {
  background: var(--bg-surface);
  border: 1px solid var(--border-hairline);
  border-radius: var(--radius-lg);
  padding: 18px 22px;
  box-shadow: var(--shadow-xs);
  display: flex;
  flex-direction: column;
  gap: 10px;
  cursor: text;
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-title {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.card-title svg {
  color: var(--accent);
}

.memo-count {
  font-size: 12px;
  color: var(--text-tertiary);
}

.day-task-list,
.day-memo-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.day-task-row,
.day-memo-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  border-radius: var(--radius-sm);
  cursor: default;
  transition: background-color 0.12s ease;
}

.day-task-row.is-editing,
.day-memo-row.is-editing {
  padding: 0;
}

.day-task-row:hover:not(.is-editing),
.day-memo-row:hover:not(.is-editing) {
  background: var(--bg-surface-subtle);
}

.row-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 3px;
  opacity: 0;
  transition: opacity 0.12s ease;
}

.day-task-row:hover .row-actions,
.day-memo-row:hover .row-actions {
  opacity: 1;
}

.time-badge {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  background: var(--accent-soft);
  color: var(--accent);
  flex-shrink: 0;
}

.day-task-row.is-done .time-badge {
  background: var(--bg-muted);
  color: var(--text-tertiary);
}

.task-name {
  flex: 1;
  min-width: 0;
  font-size: 13.5px;
  color: var(--text-primary);
}

.day-task-row.is-done .task-name {
  color: var(--text-tertiary);
  text-decoration: line-through;
}

.full-edit-wrap {
  width: 100%;
}

.bullet {
  color: var(--accent);
  font-weight: 700;
  font-size: 15px;
  line-height: 1;
}

.memo-content {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--text-secondary);
}

.doc-compose {
  padding: 7px 10px;
  border-radius: var(--radius-sm);
  background: var(--accent-soft);
  border: 1px solid var(--accent-border);
}

.doc-input {
  width: 100%;
  border: none;
  background: transparent;
  outline: none;
  font-size: 13px;
  color: var(--text-primary);
}

.doc-input::placeholder {
  color: var(--text-tertiary);
}

.doc-input.has-error {
  color: var(--danger);
}

.doc-err {
  margin: 4px 0 0;
  font-size: 11.5px;
  color: var(--danger);
}

.ghost-entry {
  padding: 6px 10px;
  font-size: 12.5px;
  color: var(--text-placeholder);
  user-select: none;
}

.card:hover .ghost-entry {
  color: var(--text-tertiary);
}
</style>
