<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { Bell, Trash2 } from 'lucide-vue-next';
import { useDragReorder } from '@/composables/useDragReorder';
import type { WeekDayMeta } from '@/core/dateUtils';
import {
  classifyQuickLine,
  formatDailyMemoLine,
  isBlankOrBarePrefix,
  resolveEditedMemo,
} from '@/core/timeParser';
import { useScheduleStore } from '@/stores/scheduleStore';
import type { DailyMemo } from '@/types/schedule';

const props = defineProps<{
  day: WeekDayMeta;
  colIndex: number;
  isLastCol?: boolean;
}>();

const store = useScheduleStore();

const memos = computed(() => store.memosForDate(props.day.date));
const memoListRef = ref<HTMLUListElement | null>(null);

const isQuickTyping = ref(false);
const quickDraft = ref('');
const quickError = ref('');
const quickInputRef = ref<HTMLInputElement | null>(null);

const editingMemoId = ref<string | null>(null);
const editMemoOriginalDraft = ref('');
const editMemoDraft = ref('');
const editMemoError = ref('');
const editInputRef = ref<HTMLInputElement | HTMLInputElement[] | null>(null);

const { draggingId, dropIndicator, onRowPointerDown } = useDragReorder({
  getItemIds: () => memos.value.map((m) => m.id),
  getRowElements: () =>
    Array.from(memoListRef.value?.querySelectorAll<HTMLElement>('[data-drag-id]') ?? []),
  onReorder: (orderedIds) => store.reorderMemos(props.day.date, orderedIds),
  isDisabled: () => editingMemoId.value !== null,
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
  if (editingMemoId.value) return;
  isQuickTyping.value = true;
  quickDraft.value = '- ';
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
      reminderTime: res.reminderTime,
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
    quickDraft.value = '- ';
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

async function startEditMemo(memo: DailyMemo): Promise<void> {
  closeQuickInput();
  const initialLine = formatDailyMemoLine(memo);
  editingMemoId.value = memo.id;
  editMemoOriginalDraft.value = initialLine;
  editMemoDraft.value = initialLine;
  editMemoError.value = '';
  await nextTick();
  focusElAtEnd(resolveEditInput());
}

function cancelEditMemo(): void {
  editingMemoId.value = null;
  editMemoOriginalDraft.value = '';
  editMemoDraft.value = '';
  editMemoError.value = '';
}

async function handleEditEnter(memo: DailyMemo): Promise<void> {
  if (editingMemoId.value !== memo.id) return;
  const decision = resolveEditedMemo(editMemoDraft.value, editMemoOriginalDraft.value);
  if (decision.action === 'blank') {
    cancelEditMemo();
    store.requestDeleteMemo(memo);
    return;
  }
  if (decision.action === 'unchanged') {
    cancelEditMemo();
    return;
  }
  if (decision.action === 'error') {
    editMemoError.value = decision.error;
    return;
  }

  await store.saveMemo({
    id: memo.id,
    memoDate: memo.memoDate,
    content: decision.content,
    reminderTime: decision.reminderTime,
    sortOrder: memo.sortOrder,
  });
  cancelEditMemo();
}

async function handleEditBlur(memo: DailyMemo): Promise<void> {
  if (editingMemoId.value !== memo.id) return;
  const decision = resolveEditedMemo(editMemoDraft.value, editMemoOriginalDraft.value);
  if (decision.action === 'blank' || decision.action === 'unchanged') {
    cancelEditMemo();
    return;
  }
  if (decision.action === 'error') {
    editMemoError.value = decision.error;
    return;
  }

  await store.saveMemo({
    id: memo.id,
    memoDate: memo.memoDate,
    content: decision.content,
    reminderTime: decision.reminderTime,
    sortOrder: memo.sortOrder,
  });
  cancelEditMemo();
}
</script>

<template>
  <div
    class="memo-cell"
    :class="{
      'is-today': day.isToday,
      'is-weekend': day.isWeekend,
      'is-last-col': props.isLastCol ?? colIndex === 6,
    }"
    :style="{ gridColumn: colIndex + 1, gridRow: 3 }"
    @click="handleBlankClick()"
  >
    <ul v-if="memos.length > 0" ref="memoListRef" class="memo-list">
      <li
        v-for="memo in memos"
        :key="memo.id"
        :data-drag-id="memo.id"
        class="memo-row"
        :class="{
          'is-editing': editingMemoId === memo.id,
          'is-dragging': draggingId === memo.id,
          'drag-over-before': dropIndicator?.id === memo.id && dropIndicator.position === 'before',
          'drag-over-after': dropIndicator?.id === memo.id && dropIndicator.position === 'after',
        }"
        @pointerdown="onRowPointerDown(memo.id, $event)"
        @click.stop
      >
        <div v-if="editingMemoId === memo.id" class="doc-input-wrap inline-edit" data-no-drag>
          <input
            ref="editInputRef"
            v-model="editMemoDraft"
            type="text"
            class="doc-line-input"
            :class="{ 'has-error': Boolean(editMemoError) }"
            placeholder="- 备忘内容"
            @input="editMemoError = ''"
            @keydown.enter.prevent="handleEditEnter(memo)"
            @keydown.esc.stop="cancelEditMemo()"
            @blur="handleEditBlur(memo)"
          />
          <p v-if="editMemoError" class="doc-feedback error">{{ editMemoError }}</p>
        </div>

        <template v-else>
          <span class="memo-dot">-</span>
          <span class="memo-text" @dblclick.stop="startEditMemo(memo)">
            <span>{{ memo.content }}</span>
            <span
              v-if="memo.reminderTime"
              class="memo-reminder-badge tabular-nums"
              :title="`将于 ${memo.reminderTime} 前提醒`"
            >
              <Bell :size="9.5" :stroke-width="2.1" />
              <span>{{ memo.reminderTime }}</span>
            </span>
          </span>
          <div class="item-actions" @dblclick.stop>
            <button
              type="button"
              class="icon-btn danger"
              title="删除"
              aria-label="删除"
              @click.stop="store.requestDeleteMemo(memo)"
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
        placeholder="- 备忘内容"
        @input="quickError = ''"
        @keydown.enter.prevent="handleQuickEnter()"
        @keydown.esc.stop="closeQuickInput()"
        @blur="handleQuickBlur()"
      />
      <p v-if="quickError" class="doc-feedback error">{{ quickError }}</p>
    </div>

    <div v-else class="blank-affordance">
      <span>- </span>
    </div>
  </div>
</template>

<style scoped>
.memo-cell {
  min-width: 0;
  padding: 7px 8px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: var(--bg-surface-memo);
  border-right: 1px solid var(--border-subtle);
  cursor: text;
  transition: background-color 0.14s ease;
}

.memo-cell.is-last-col {
  border-right: none;
}

.memo-cell.is-weekend {
  background: var(--bg-weekend);
}

.memo-cell.is-today {
  background: var(--bg-today);
}

.memo-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.memo-row {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 5px;
  padding: 3px 6px;
  border-radius: var(--radius-xs);
  font-size: 11.5px;
  line-height: 1.44;
  color: var(--text-secondary);
  cursor: grab;
  transition: background-color 0.12s ease;
}

.memo-row:active {
  cursor: grabbing;
}

.memo-row.is-editing {
  padding: 0;
  cursor: default;
}

.memo-row:hover:not(.is-editing) {
  background: var(--bg-hover);
}

.memo-cell.is-today .memo-row:hover:not(.is-editing) {
  background: var(--bg-today-hover);
}

.memo-dot {
  color: var(--text-tertiary);
  font-weight: 600;
  line-height: 1.4;
  flex-shrink: 0;
}

.memo-text {
  flex: 1;
  min-width: 0;
  word-break: break-word;
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
}

.memo-reminder-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 0 5px;
  height: 16px;
  border-radius: var(--radius-xs);
  background: var(--warning-soft);
  border: 1px solid var(--warning-border);
  color: var(--warning);
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
}

.item-actions {
  position: absolute;
  top: 2px;
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

.memo-row:hover .item-actions {
  opacity: 1;
}

.doc-input-wrap {
  padding: 4px 6px;
  border-radius: var(--radius-xs);
  background: var(--bg-surface);
  border: 1px solid var(--accent-border);
  box-shadow: 0 0 0 2.5px var(--accent-ring);
  width: 100%;
}

.doc-line-input {
  width: 100%;
  border: none;
  background: transparent;
  padding: 1px 0;
  font-size: 11.5px;
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
  padding: 3px 4px 0;
  font-size: 10.5px;
  color: var(--text-placeholder);
  opacity: 0;
  transition: opacity 0.14s ease;
  user-select: none;
}

.memo-cell:hover .blank-affordance {
  opacity: 1;
}
</style>
