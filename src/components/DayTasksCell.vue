<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { Check, Trash2 } from 'lucide-vue-next';
import { useDragReorder } from '@/composables/useDragReorder';
import type { WeekDayMeta } from '@/core/dateUtils';
import {
  classifyQuickLine,
  formatCompactRange,
  formatDailyTaskLine,
  isBlankOrBarePrefix,
  parseShorthandTask,
} from '@/core/timeParser';
import { useScheduleStore } from '@/stores/scheduleStore';
import type { DailyTask } from '@/types/schedule';

const props = defineProps<{
  day: WeekDayMeta;
  colIndex: number;
  isLastCol?: boolean;
}>();

const store = useScheduleStore();

const tasks = computed(() => store.tasksForDate(props.day.date));
const taskListRef = ref<HTMLUListElement | null>(null);

const isQuickTyping = ref(false);
const quickDraft = ref('');
const quickError = ref('');
const quickInputRef = ref<HTMLInputElement | null>(null);

const editingTaskId = ref<string | null>(null);
const editDraft = ref('');
const editError = ref('');
const editInputRef = ref<HTMLInputElement | HTMLInputElement[] | null>(null);

const { draggingId, dropIndicator, onRowPointerDown } = useDragReorder({
  getItemIds: () => tasks.value.map((t) => t.id),
  getRowElements: () =>
    Array.from(taskListRef.value?.querySelectorAll<HTMLElement>('[data-drag-id]') ?? []),
  onReorder: (orderedIds) => store.reorderTasks(props.day.date, orderedIds),
  isDisabled: () => editingTaskId.value !== null,
});

function focusElAtEnd(el: HTMLInputElement | null): void {
  if (!el) return;
  el.focus();
  const len = el.value.length;
  el.setSelectionRange(len, len);
}

function resolveEditInput(): HTMLInputElement | null {
  const r = editInputRef.value;
  return Array.isArray(r) ? (r[0] ?? null) : r;
}

async function handleBlankClick(): Promise<void> {
  if (editingTaskId.value) return;
  isQuickTyping.value = true;
  quickDraft.value = '【】';
  quickError.value = '';
  await nextTick();
  focusElAtEnd(quickInputRef.value);
}

function closeQuickInput(): void {
  isQuickTyping.value = false;
  quickDraft.value = '';
  quickError.value = '';
}

async function commitQuickInput(keepOpen: boolean): Promise<void> {
  if (isBlankOrBarePrefix(quickDraft.value)) {
    closeQuickInput();
    return;
  }

  const res = classifyQuickLine(quickDraft.value);
  if (res.kind === 'empty') {
    closeQuickInput();
    return;
  }

  if (res.kind === 'invalid') {
    quickError.value = res.error;
    return;
  }

  if (res.kind === 'memo') {
    await store.saveMemo({
      memoDate: props.day.date,
      content: res.content,
    });
  } else {
    if (!res.parsed.ok) {
      quickError.value = res.parsed.error;
      return;
    }
    await store.saveTask({
      taskDate: props.day.date,
      startTime: res.parsed.startTime,
      endTime: res.parsed.endTime,
      title: res.parsed.title,
      isDone: res.parsed.isDone,
    });
  }

  quickError.value = '';
  if (keepOpen) {
    quickDraft.value = '【】';
    await nextTick();
    focusElAtEnd(quickInputRef.value);
  } else {
    closeQuickInput();
  }
}

async function handleQuickEnter(): Promise<void> {
  await commitQuickInput(true);
}

async function handleQuickBlur(): Promise<void> {
  if (!isQuickTyping.value) return;
  await commitQuickInput(false);
}

async function startEditTask(task: DailyTask): Promise<void> {
  closeQuickInput();
  editingTaskId.value = task.id;
  editDraft.value = formatDailyTaskLine(task);
  editError.value = '';
  await nextTick();
  focusElAtEnd(resolveEditInput());
}

function cancelEditTask(): void {
  editingTaskId.value = null;
  editDraft.value = '';
  editError.value = '';
}

async function handleEditEnter(task: DailyTask): Promise<void> {
  if (editingTaskId.value !== task.id) return;
  if (isBlankOrBarePrefix(editDraft.value)) {
    cancelEditTask();
    store.requestDeleteTask(task);
    return;
  }

  const parsed = parseShorthandTask(editDraft.value);
  if (!parsed.ok) {
    editError.value = parsed.error;
    return;
  }

  await store.saveTask({
    id: task.id,
    taskDate: task.taskDate,
    startTime: parsed.startTime,
    endTime: parsed.endTime,
    title: parsed.title,
    isDone: parsed.isDone,
    sortOrder: task.sortOrder,
  });
  cancelEditTask();
}

async function handleEditBlur(task: DailyTask): Promise<void> {
  if (editingTaskId.value !== task.id) return;
  if (isBlankOrBarePrefix(editDraft.value)) {
    cancelEditTask();
    return;
  }

  const parsed = parseShorthandTask(editDraft.value);
  if (!parsed.ok) {
    editError.value = parsed.error;
    return;
  }

  await store.saveTask({
    id: task.id,
    taskDate: task.taskDate,
    startTime: parsed.startTime,
    endTime: parsed.endTime,
    title: parsed.title,
    isDone: parsed.isDone,
    sortOrder: task.sortOrder,
  });
  cancelEditTask();
}
</script>

<template>
  <div
    class="tasks-cell"
    :class="{
      'is-today': day.isToday,
      'is-weekend': day.isWeekend,
      'is-last-col': props.isLastCol ?? colIndex === 6,
    }"
    :style="{ gridColumn: colIndex + 1, gridRow: 2 }"
    @click="handleBlankClick()"
  >
    <ul v-if="tasks.length > 0" ref="taskListRef" class="task-list">
      <li
        v-for="task in tasks"
        :key="task.id"
        :data-drag-id="task.id"
        class="task-card"
        :class="{
          'is-done': task.isDone,
          'is-editing': editingTaskId === task.id,
          'is-dragging': draggingId === task.id,
          'drag-over-before': dropIndicator?.id === task.id && dropIndicator.position === 'before',
          'drag-over-after': dropIndicator?.id === task.id && dropIndicator.position === 'after',
        }"
        @pointerdown="onRowPointerDown(task.id, $event)"
        @click.stop
      >
        <div v-if="editingTaskId === task.id" class="doc-input-wrap inline-edit" data-no-drag>
          <input
            ref="editInputRef"
            v-model="editDraft"
            type="text"
            class="doc-line-input"
            :class="{ 'has-error': Boolean(editError) }"
            placeholder="【】9-10｜任务"
            @input="editError = ''"
            @keydown.enter.prevent="handleEditEnter(task)"
            @keydown.esc.stop="cancelEditTask()"
            @blur="handleEditBlur(task)"
          />
          <p v-if="editError" class="doc-feedback error">{{ editError }}</p>
        </div>

        <template v-else>
          <button
            type="button"
            class="check-box task-check"
            :class="{ checked: task.isDone }"
            :title="task.isDone ? '取消完成' : '完成'"
            :aria-label="task.isDone ? '取消完成' : '标记完成'"
            @click.stop="store.toggleTaskDone(task)"
            @dblclick.stop
          >
            <Check v-if="task.isDone" :size="10" :stroke-width="3" />
            <Check v-else :size="9" :stroke-width="2.5" class="check-preview" />
          </button>

          <div class="task-content" @dblclick.stop="startEditTask(task)">
            <div class="task-time tabular-nums">
              {{ formatCompactRange(task.startTime, task.endTime) }}
            </div>
            <div class="task-title">{{ task.title }}</div>
          </div>

          <div class="item-actions" @dblclick.stop>
            <button
              type="button"
              class="icon-btn check-action"
              :class="{ active: task.isDone }"
              :title="task.isDone ? '取消完成' : '完成'"
              :aria-label="task.isDone ? '取消完成' : '完成'"
              @click.stop="store.toggleTaskDone(task)"
            >
              <Check :size="11" :stroke-width="2.4" />
            </button>
            <button
              type="button"
              class="icon-btn danger"
              title="删除"
              aria-label="删除"
              @click.stop="store.requestDeleteTask(task)"
            >
              <Trash2 :size="11" />
            </button>
          </div>
        </template>
      </li>
    </ul>

    <div v-if="isQuickTyping" class="doc-input-wrap" @click.stop>
      <input
        ref="quickInputRef"
        v-model="quickDraft"
        type="text"
        class="doc-line-input"
        :class="{ 'has-error': Boolean(quickError) }"
        placeholder="【】9-10｜任务"
        @input="quickError = ''"
        @keydown.enter.prevent="handleQuickEnter()"
        @keydown.esc.stop="closeQuickInput()"
        @blur="handleQuickBlur()"
      />
      <p v-if="quickError" class="doc-feedback error">{{ quickError }}</p>
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
  cursor: grab;
}

.task-card:active {
  cursor: grabbing;
}

.task-card.is-editing {
  padding: 0;
  cursor: default;
}

.task-card:hover:not(.is-editing) {
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
  text-decoration: line-through;
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
  width: 100%;
}

.doc-input-wrap.inline-edit {
  margin-top: 0;
}

.doc-line-input {
  width: 100%;
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

.doc-feedback {
  margin: 2px 0 0;
  font-size: 10.5px;
  line-height: 1.3;
  color: var(--text-tertiary);
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
</style>
