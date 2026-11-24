<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import {
  ArrowLeft,
  Check,
  Clock,
  Columns2,
  Pencil,
  StickyNote,
  Trash2,
} from 'lucide-vue-next';
import TaskQuickEditor from '@/components/TaskQuickEditor.vue';
import { formatFullDayLabel, isWeekendDate, todayStr } from '@/core/dateUtils';
import { classifyQuickLine, parseShorthandTask } from '@/core/timeParser';
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
const taskInlineAttempted = ref(false);
const taskInlineRef = ref<HTMLInputElement | null>(null);

const showStructuredTaskEditor = ref(false);
const editingTaskId = ref<string | null>(null);

const isMemoInlineOpen = ref(false);
const newMemoText = ref('');
const newMemoError = ref('');
const memoInlineRef = ref<HTMLInputElement | null>(null);

const editingMemoId = ref<string | null>(null);
const editMemoText = ref('');

const taskInlineParsed = computed(() => {
  if (!taskInlineDraft.value.trim()) return null;
  return parseShorthandTask(taskInlineDraft.value);
});

async function openTaskInline(): Promise<void> {
  if (showStructuredTaskEditor.value || editingTaskId.value) return;
  isTaskInlineOpen.value = true;
  taskInlineAttempted.value = false;
  await nextTick();
  taskInlineRef.value?.focus();
}

function closeTaskInline(): void {
  isTaskInlineOpen.value = false;
  taskInlineDraft.value = '';
  taskInlineAttempted.value = false;
}

async function submitTaskInline(): Promise<void> {
  if (!taskInlineDraft.value.trim()) {
    closeTaskInline();
    return;
  }
  const parsed = parseShorthandTask(taskInlineDraft.value);
  if (!parsed.ok) {
    taskInlineAttempted.value = true;
    return;
  }
  await store.saveTask({
    taskDate: store.selectedDate,
    startTime: parsed.startTime,
    endTime: parsed.endTime,
    title: parsed.title,
    isDone: parsed.isDone,
  });
  taskInlineDraft.value = '';
  taskInlineAttempted.value = false;
  await nextTick();
  taskInlineRef.value?.focus();
}

async function handleCreateTask(payload: {
  startTime: string;
  endTime: string;
  title: string;
}): Promise<void> {
  await store.saveTask({
    taskDate: store.selectedDate,
    startTime: payload.startTime,
    endTime: payload.endTime,
    title: payload.title,
    isDone: false,
  });
  showStructuredTaskEditor.value = false;
}

async function handleUpdateTask(
  task: DailyTask,
  payload: { startTime: string; endTime: string; title: string }
): Promise<void> {
  await store.saveTask({
    id: task.id,
    taskDate: task.taskDate,
    startTime: payload.startTime,
    endTime: payload.endTime,
    title: payload.title,
    isDone: task.isDone,
  });
  editingTaskId.value = null;
}

async function openMemoInline(): Promise<void> {
  if (editingMemoId.value) return;
  isMemoInlineOpen.value = true;
  newMemoError.value = '';
  await nextTick();
  memoInlineRef.value?.focus();
}

function closeMemoInline(): void {
  isMemoInlineOpen.value = false;
  newMemoText.value = '';
  newMemoError.value = '';
}

async function submitNewMemo(): Promise<void> {
  if (!newMemoText.value.trim()) {
    closeMemoInline();
    return;
  }
  const res = classifyQuickLine(newMemoText.value);
  if (res.kind === 'memo') {
    await store.saveMemo({
      memoDate: store.selectedDate,
      content: res.content,
    });
    newMemoText.value = '';
    newMemoError.value = '';
    await nextTick();
    memoInlineRef.value?.focus();
    return;
  }
  if (res.kind === 'task' && res.parsed.ok) {
    await store.saveTask({
      taskDate: store.selectedDate,
      startTime: res.parsed.startTime,
      endTime: res.parsed.endTime,
      title: res.parsed.title,
      isDone: res.parsed.isDone,
    });
    newMemoText.value = '';
    newMemoError.value = '';
    await nextTick();
    memoInlineRef.value?.focus();
    return;
  }
  newMemoError.value =
    res.kind === 'invalid'
      ? res.error
      : res.kind === 'task' && !res.parsed.ok
        ? res.parsed.error
        : '请以「- 」开头记录备忘';
}

function startEditMemo(memo: DailyMemo): void {
  isMemoInlineOpen.value = false;
  editingMemoId.value = memo.id;
  editMemoText.value = memo.content;
}

function cancelEditMemo(): void {
  editingMemoId.value = null;
  editMemoText.value = '';
}

async function submitEditMemo(memo: DailyMemo): Promise<void> {
  const raw = editMemoText.value.trim();
  if (!raw) return;
  const content = raw.replace(/^[-－]\s*/, '').trim();
  if (!content) return;
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
          <button
            type="button"
            class="icon-btn"
            title="分字段表单"
            @click.stop="
              closeTaskInline();
              editingTaskId = null;
              showStructuredTaskEditor = !showStructuredTaskEditor;
            "
          >
            <Columns2 :size="14" />
          </button>
        </div>

        <ul v-if="tasks.length > 0" class="day-task-list">
          <li
            v-for="task in tasks"
            :key="task.id"
            class="day-task-row"
            :class="{ 'is-done': task.isDone }"
            @click.stop
          >
            <template v-if="editingTaskId === task.id">
              <div class="full-edit-wrap">
                <TaskQuickEditor
                  :task="task"
                  @submit="handleUpdateTask(task, $event)"
                  @cancel="editingTaskId = null"
                />
              </div>
            </template>

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

              <span class="task-name" @dblclick.stop="editingTaskId = task.id">
                {{ task.title }}
              </span>

              <div class="row-actions">
                <button
                  type="button"
                  class="icon-btn"
                  title="编辑"
                  @click.stop="editingTaskId = task.id"
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
            placeholder="【】9-10｜周会"
            @keydown.enter.prevent="submitTaskInline()"
            @keydown.esc.stop="closeTaskInline()"
          />
          <p v-if="taskInlineParsed && !taskInlineParsed.ok && (taskInlineAttempted || taskInlineDraft.trim())" class="doc-err">
            {{ taskInlineParsed.error }}
          </p>
          <p v-else-if="taskInlineParsed && taskInlineParsed.ok" class="doc-ok tabular-nums">
            {{ taskInlineParsed.startTime }} - {{ taskInlineParsed.endTime }} · {{ taskInlineParsed.title }}
          </p>
        </div>

        <div v-else-if="showStructuredTaskEditor" class="editor-slot" @click.stop>
          <TaskQuickEditor
            @submit="handleCreateTask($event)"
            @cancel="showStructuredTaskEditor = false"
          />
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
            @click.stop
          >
            <template v-if="editingMemoId === memo.id">
              <div class="memo-edit-row" @keydown.esc.stop="cancelEditMemo()">
                <input
                  v-model="editMemoText"
                  type="text"
                  class="field-input"
                  autofocus
                  @keydown.enter.prevent="submitEditMemo(memo)"
                />
                <button type="button" class="btn btn-primary" @click="submitEditMemo(memo)">
                  保存
                </button>
                <button type="button" class="btn" @click="cancelEditMemo()">取消</button>
              </div>
            </template>

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
            placeholder="- 备忘内容"
            @input="newMemoError = ''"
            @keydown.enter.prevent="submitNewMemo()"
            @keydown.esc.stop="closeMemoInline()"
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

.day-task-row:hover,
.day-memo-row:hover {
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

.editor-slot {
  padding-top: 4px;
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

.memo-edit-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
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

.doc-err {
  margin: 4px 0 0;
  font-size: 11.5px;
  color: var(--danger);
}

.doc-ok {
  margin: 4px 0 0;
  font-size: 11.5px;
  color: var(--success);
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
