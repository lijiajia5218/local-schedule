<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { Pencil, Trash2 } from 'lucide-vue-next';
import type { WeekDayMeta } from '@/core/dateUtils';
import { classifyQuickLine } from '@/core/timeParser';
import { useScheduleStore } from '@/stores/scheduleStore';
import type { DailyMemo } from '@/types/schedule';

const props = defineProps<{
  day: WeekDayMeta;
  colIndex: number;
}>();

const store = useScheduleStore();

const memos = computed(() => store.memosForDate(props.day.date));

const isQuickTyping = ref(false);
const quickDraft = ref('');
const quickAttempted = ref(false);
const quickInputRef = ref<HTMLInputElement | null>(null);

const editingMemoId = ref<string | null>(null);
const editMemoDraft = ref('');

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
  if (res.kind === 'memo') {
    return `备忘：${res.content}`;
  }
  if (res.kind === 'task' && res.parsed.ok) {
    const p = res.parsed;
    return `→ 待办：${p.startTime}-${p.endTime} ${p.title}`;
  }
  return '';
});

async function handleBlankClick(): Promise<void> {
  if (editingMemoId.value) return;
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
    quickAttempted.value = true;
    return;
  }
  await commitQuickInput(false);
}

function startEditMemo(memo: DailyMemo): void {
  closeQuickInput();
  editingMemoId.value = memo.id;
  editMemoDraft.value = memo.content;
}

function cancelEditMemo(): void {
  editingMemoId.value = null;
  editMemoDraft.value = '';
}

async function submitEditMemo(memo: DailyMemo): Promise<void> {
  const raw = editMemoDraft.value.trim();
  if (!raw) return;
  // Strip optional leading `- ` if user typed it during edit
  const cleaned = raw.replace(/^[-－]\s*/, '').trim();
  if (!cleaned) return;
  await store.saveMemo({
    id: memo.id,
    memoDate: memo.memoDate,
    content: cleaned,
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
      'is-last-col': colIndex === 6,
    }"
    :style="{ gridColumn: colIndex + 1, gridRow: 3 }"
    @click="handleBlankClick()"
  >
    <ul v-if="memos.length > 0" class="memo-list">
      <li
        v-for="memo in memos"
        :key="memo.id"
        class="memo-row"
        @click.stop
      >
        <template v-if="editingMemoId === memo.id">
          <div class="memo-edit-box" @keydown.esc.stop="cancelEditMemo()">
            <input
              v-model="editMemoDraft"
              type="text"
              class="field-input memo-inline-input"
              autofocus
              @keydown.enter.prevent="submitEditMemo(memo)"
            />
            <div class="memo-edit-btns">
              <button type="button" class="btn btn-primary" @click="submitEditMemo(memo)">
                保存
              </button>
              <button type="button" class="btn" @click="cancelEditMemo()">取消</button>
            </div>
          </div>
        </template>

        <template v-else>
          <span class="memo-dot">-</span>
          <span class="memo-text" @dblclick.stop="startEditMemo(memo)">
            {{ memo.content }}
          </span>
          <div class="item-actions">
            <button
              type="button"
              class="icon-btn"
              title="编辑"
              @click.stop="startEditMemo(memo)"
            >
              <Pencil :size="11" />
            </button>
            <button
              type="button"
              class="icon-btn danger"
              title="删除"
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
        @keydown.enter.prevent="handleQuickEnter()"
        @keydown.esc.stop="closeQuickInput()"
        @blur="handleQuickBlur()"
      />
      <p v-if="quickError" class="doc-feedback error">{{ quickError }}</p>
      <p
        v-else-if="quickHint"
        class="doc-feedback"
        :class="{ valid: quickResult.kind === 'memo' }"
      >
        {{ quickHint }}
      </p>
    </div>

    <div v-else class="blank-affordance">
      <span>- </span>
    </div>
  </div>
</template>

<style scoped>
.memo-cell {
  min-width: 0;
  padding: 6px 7px 7px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: #fafbfd;
  border-right: 1px solid var(--border-subtle);
  cursor: text;
  transition: background-color 0.14s ease;
}

.memo-cell.is-last-col {
  border-right: none;
}

.memo-cell.is-weekend {
  background: #f5f7fb;
}

.memo-cell.is-today {
  background: #f4f8ff;
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
  padding: 2.5px 5px;
  border-radius: var(--radius-xs);
  font-size: 11.5px;
  line-height: 1.4;
  color: var(--text-secondary);
  cursor: default;
  transition: background-color 0.12s ease;
}

.memo-row:hover {
  background: var(--bg-hover);
}

.memo-dot {
  color: var(--text-tertiary);
  font-weight: 600;
  line-height: 1.35;
  flex-shrink: 0;
}

.memo-text {
  flex: 1;
  min-width: 0;
  word-break: break-word;
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
  padding: 4px 5px;
  border-radius: var(--radius-xs);
  background: var(--bg-surface);
  border: 1px solid var(--accent-border);
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

.doc-feedback.valid {
  color: var(--success);
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

.memo-edit-box {
  display: flex;
  flex-direction: column;
  gap: 5px;
  width: 100%;
}

.memo-inline-input {
  height: 27px;
  font-size: 11.5px;
  padding: 0 7px;
}

.memo-edit-btns {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
}

.memo-edit-btns .btn {
  height: 23px;
  padding: 0 8px;
  font-size: 11px;
}
</style>
