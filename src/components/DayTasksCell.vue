<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { Check, Columns2, Pencil, Trash2 } from 'lucide-vue-next';
import TaskQuickEditor from '@/components/TaskQuickEditor.vue';
import type { WeekDayMeta } from '@/core/dateUtils';
import { classifyQuickLine, formatCompactRange } from '@/core/timeParser';
import { useScheduleStore } from '@/stores/scheduleStore';
import type { DailyTask } from '@/types/schedule';

const props = defineProps<{
  day: WeekDayMeta;
  colIndex: number;
}>();

const store = useScheduleStore();

const tasks = computed(() => store.tasksForDate(props.day.date));

const isQuickTyping = ref(false);
const quickDraft = ref('');
const quickAttempted = ref(false);
const quickInputRef = ref<HTMLInputElement | null>(null);

const showStructuredAdd = ref(false);
const editingTaskId = ref<string | null>(null);

const quickResult = computed(() => classifyQuickLine(quickDraft.value));

const quickError = computed(() => {
  const res = quickResult.value;
  if (res.kind === 'invalid') {
    return quickAttempted.value || quickDraft.value.trim().length > 0 ? res.error : '';
  }
  if (res.kind === 'task' && !res.parsed.ok) {
    return res.parsed.error;
  }
  return '';
});

const quickHint = computed(() => {
  const res = quickResult.value;
  if (res.kind === 'task' && res.parsed.ok) {
    const p = res.parsed;
    return `${p.startTime}-${p.endTime} · ${p.title}`;
  }
  if (res.kind === 'memo') {
    return `→ 备忘：${res.content}`;
  }
  return '';
});

async function handleBlankClick(): Promise<void> {
  if (showStructuredAdd.value || editingTaskId.value) return;
  isQuickTyping.value = true;
  quickAttempted.value = false;
  await nextTick();
  quickInputRef.value?.focus();
}

function closeQuickInput(): void {
  isQuickTyping.value = false;
  quickDraft.value = '';
  quickAttempted.value = false;
}

async function commitQuickInput(keepOpen: boolean): Promise<boolean> {
  const res = classifyQuickLine(quickDraft.value);
  if (res.kind === 'empty') {
    if (!keepOpen) closeQuickInput();
    return true;
  }

  if (res.kind === 'invalid') {
    quickAttempted.value = true;
    return false;
  }

  if (res.kind === 'memo') {
    await store.saveMemo({
      memoDate: props.day.date,
      content: res.content,
    });
    quickDraft.value = '';
    quickAttempted.value = false;
    if (!keepOpen) isQuickTyping.value = false;
    else {
      await nextTick();
      quickInputRef.value?.focus();
    }
    return true;
  }

  if (!res.parsed.ok) {
    quickAttempted.value = true;
    return false;
  }

  await store.saveTask({
    taskDate: props.day.date,
    startTime: res.parsed.startTime,
    endTime: res.parsed.endTime,
    title: res.parsed.title,
    isDone: res.parsed.isDone,
  });
  quickDraft.value = '';
  quickAttempted.value = false;
  if (!keepOpen) isQuickTyping.value = false;
  else {
    await nextTick();
    quickInputRef.value?.focus();
  }
  return true;
}

async function handleQuickEnter(): Promise<void> {
  if (!quickDraft.value.trim()) {
    closeQuickInput();
    return;
  }
  await commitQuickInput(true);
}

async function handleQuickBlur(): Promise<void> {
  if (!isQuickTyping.value) return;
  const res = classifyQuickLine(quickDraft.value);
  if (res.kind === 'empty') {
    closeQuickInput();
    return;
  }
  if (res.kind === 'invalid' || (res.kind === 'task' && !res.parsed.ok)) {
    // Reject invalid / plain text input and preserve it with inline hint
    quickAttempted.value = true;
    return;
  }
  await commitQuickInput(false);
}

function switchToStructuredEditor(): void {
  isQuickTyping.value = false;
  quickDraft.value = '';
  quickAttempted.value = false;
  editingTaskId.value = null;
  showStructuredAdd.value = true;
}

async function handleCreateStructuredTask(payload: {
  startTime: string;
  endTime: string;
  title: string;
  isDone?: boolean;
}): Promise<void> {
  await store.saveTask({
    taskDate: props.day.date,
    startTime: payload.startTime,
    endTime: payload.endTime,
    title: payload.title,
    isDone: payload.isDone ?? false,
  });
  showStructuredAdd.value = false;
}

async function handleUpdateTask(
  task: DailyTask,
  payload: { startTime: string; endTime: string; title: string; isDone?: boolean }
): Promise<void> {
  await store.saveTask({
    id: task.id,
    taskDate: task.taskDate,
    startTime: payload.startTime,
    endTime: payload.endTime,
    title: payload.title,
    isDone: payload.isDone ?? task.isDone,
  });
  editingTaskId.value = null;
}
</script>

<template>
  <div
    class="tasks-cell"
    :class="{
      'is-today': day.isToday,
      'is-weekend': day.isWeekend,
      'is-last-col': colIndex === 6,
    }"
    :style="{ gridColumn: colIndex + 1, gridRow: 2 }"
    @click="handleBlankClick()"
  >
    <ul v-if="tasks.length > 0" class="task-list">
      <li
        v-for="task in tasks"
        :key="task.id"
        class="task-card"
        :class="{ 'is-done': task.isDone }"
        @click.stop
      >
        <template v-if="editingTaskId === task.id">
          <TaskQuickEditor
            :task="task"
            compact
            @submit="handleUpdateTask(task, $event)"
            @cancel="editingTaskId = null"
          />
        </template>

        <template v-else>
          <button
            type="button"
            class="check-box task-check"
            :class="{ checked: task.isDone }"
            :aria-label="task.isDone ? '取消完成' : '标记完成'"
            @click.stop="store.toggleTaskDone(task)"
          >
            <Check v-if="task.isDone" :size="10" :stroke-width="3" />
          </button>

          <div class="task-content" @dblclick.stop="editingTaskId = task.id">
            <div class="task-time tabular-nums">
              {{ formatCompactRange(task.startTime, task.endTime) }}
            </div>
            <div class="task-title">{{ task.title }}</div>
          </div>

          <div class="item-actions">
            <button
              type="button"
              class="icon-btn"
              title="编辑"
              @click.stop="editingTaskId = task.id"
            >
              <Pencil :size="11" />
            </button>
            <button
              type="button"
              class="icon-btn danger"
              title="删除"
              @click.stop="store.requestDeleteTask(task)"
            >
              <Trash2 :size="11" />
            </button>
          </div>
        </template>
      </li>
    </ul>

    <div v-if="isQuickTyping" class="doc-input-wrap" @click.stop>
      <div class="doc-input-row">
        <input
          ref="quickInputRef"
          v-model="quickDraft"
          type="text"
          class="doc-line-input"
          :class="{ 'has-error': Boolean(quickError) }"
          placeholder="【】9-10｜任务"
          @keydown.enter.prevent="handleQuickEnter()"
          @keydown.esc.stop="closeQuickInput()"
          @blur="handleQuickBlur()"
        />
        <button
          type="button"
          class="mode-icon-btn"
          title="切换分字段录入"
          @mousedown.prevent="switchToStructuredEditor()"
        >
          <Columns2 :size="12" />
        </button>
      </div>
      <p v-if="quickError" class="doc-feedback error">{{ quickError }}</p>
      <p
        v-else-if="quickHint"
        class="doc-feedback"
        :class="{ valid: quickResult.kind === 'task' && quickResult.parsed.ok }"
      >
        {{ quickHint }}
      </p>
    </div>

    <div v-else-if="showStructuredAdd" class="inline-editor-wrap" @click.stop>
      <TaskQuickEditor
        compact
        @submit="handleCreateStructuredTask($event)"
        @cancel="showStructuredAdd = false"
      />
    </div>

    <div v-else class="blank-affordance">
      <span>【】9-10｜</span>
    </div>
  </div>
</template>

<style scoped>
.tasks-cell {
  min-width: 0;
  padding: 7px 7px 6px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  background: var(--bg-surface);
  border-right: 1px solid var(--border-subtle);
  border-bottom: 1px dashed #e2e7f0;
  cursor: text;
  transition: background-color 0.14s ease;
}

.tasks-cell.is-last-col {
  border-right: none;
}

.tasks-cell.is-weekend {
  background: var(--bg-weekend);
}

.tasks-cell.is-today {
  background: #fbfdff;
}

.task-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.task-card {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 4px 5px;
  border-radius: var(--radius-xs);
  transition: background-color 0.12s ease;
  cursor: default;
}

.task-card:hover {
  background: var(--bg-hover);
}

.task-check {
  margin-top: 2px;
  width: 14px;
  height: 14px;
}

.task-content {
  flex: 1;
  min-width: 0;
}

.task-time {
  font-family: var(--font-mono);
  font-size: 10.5px;
  font-weight: 500;
  color: #3b6fd8;
  line-height: 1.25;
}

.task-card.is-done .task-time {
  color: var(--text-tertiary);
}

.task-title {
  font-size: 12px;
  line-height: 1.38;
  color: var(--text-primary);
  word-break: break-word;
}

.task-card.is-done .task-title {
  color: var(--text-tertiary);
  text-decoration: line-through;
}

.item-actions {
  position: absolute;
  top: 3px;
  right: 3px;
  opacity: 0;
  display: flex;
  align-items: center;
  gap: 1px;
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid var(--border-hairline);
  border-radius: var(--radius-xs);
  padding: 1px;
  box-shadow: var(--shadow-xs);
  transition: opacity 0.12s ease;
}

.item-actions .icon-btn {
  width: 20px;
  height: 20px;
}

.task-card:hover .item-actions {
  opacity: 1;
}

.doc-input-wrap {
  margin-top: 2px;
  padding: 4px 5px;
  border-radius: var(--radius-xs);
  background: var(--accent-soft);
  border: 1px solid var(--accent-border);
}

.doc-input-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.doc-line-input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  padding: 2px 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-primary);
  outline: none;
}

.doc-line-input::placeholder {
  color: var(--text-tertiary);
}

.doc-line-input.has-error {
  color: var(--danger);
}

.mode-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.mode-icon-btn:hover {
  background: rgba(37, 99, 235, 0.12);
  color: var(--accent);
}

.doc-feedback {
  margin: 2px 0 0;
  font-size: 10.5px;
  line-height: 1.3;
  color: var(--text-tertiary);
}

.doc-feedback.valid {
  color: var(--success);
}

.doc-feedback.error {
  color: var(--danger);
}

.blank-affordance {
  margin-top: auto;
  padding: 4px 4px 0;
  font-size: 10.5px;
  color: var(--text-placeholder);
  opacity: 0;
  transition: opacity 0.14s ease;
  user-select: none;
}

.tasks-cell:hover .blank-affordance {
  opacity: 1;
}

.inline-editor-wrap {
  width: 100%;
}
</style>
