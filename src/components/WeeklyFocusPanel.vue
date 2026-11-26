<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { Check, Target, Trash2 } from 'lucide-vue-next';
import { useDragReorder } from '@/composables/useDragReorder';
import {
  formatWeeklyFocusLine,
  isBlankOrBarePrefix,
  parseWeeklyFocusLine,
} from '@/core/timeParser';
import { useScheduleStore } from '@/stores/scheduleStore';
import type { WeeklyFocus } from '@/types/schedule';

const props = defineProps<{
  weekStart: string;
}>();

const store = useScheduleStore();
const items = computed(() => store.focusesForWeek(props.weekStart));
const focusListRef = ref<HTMLUListElement | null>(null);

const isAdding = ref(false);
const addLineDraft = ref('');
const addLineError = ref('');
const addLineInput = ref<HTMLInputElement | null>(null);

const editingId = ref<string | null>(null);
const editLineDraft = ref('');
const editLineError = ref('');
const editLineInput = ref<HTMLInputElement | HTMLInputElement[] | null>(null);

const { draggingId, dropIndicator, onRowPointerDown } = useDragReorder({
  getItemIds: () => items.value.map((f) => f.id),
  getRowElements: () =>
    Array.from(focusListRef.value?.querySelectorAll<HTMLElement>('[data-drag-id]') ?? []),
  onReorder: (orderedIds) => store.reorderFocuses(props.weekStart, orderedIds),
  isDisabled: () => editingId.value !== null,
});

function focusElAtEnd(el: HTMLInputElement | null): void {
  if (!el) return;
  el.focus();
  const len = el.value.length;
  el.setSelectionRange(len, len);
}

function resolveEditInput(): HTMLInputElement | null {
  const r = editLineInput.value;
  return Array.isArray(r) ? (r[0] ?? null) : r;
}

async function openAddForm(): Promise<void> {
  if (editingId.value) return;
  store.setActiveWeek(props.weekStart);
  isAdding.value = true;
  addLineDraft.value = '【】';
  addLineError.value = '';
  await nextTick();
  focusElAtEnd(addLineInput.value);
}

function cancelAdd(): void {
  isAdding.value = false;
  addLineDraft.value = '';
  addLineError.value = '';
}

async function commitAddLine(keepOpen: boolean): Promise<void> {
  if (isBlankOrBarePrefix(addLineDraft.value)) {
    cancelAdd();
    return;
  }

  const parsed = parseWeeklyFocusLine(addLineDraft.value);
  if (!parsed.ok) {
    addLineError.value = parsed.error;
    return;
  }

  await store.saveFocus({
    weekStart: props.weekStart,
    title: parsed.title,
    targetText: parsed.targetText,
    statusNote: parsed.statusNote,
    isDone: parsed.isDone,
  });

  addLineError.value = '';
  if (keepOpen) {
    addLineDraft.value = '【】';
    await nextTick();
    focusElAtEnd(addLineInput.value);
  } else {
    cancelAdd();
  }
}

async function handleAddLineEnter(): Promise<void> {
  await commitAddLine(true);
}

async function handleAddLineBlur(): Promise<void> {
  if (!isAdding.value) return;
  await commitAddLine(false);
}

async function startEdit(item: WeeklyFocus): Promise<void> {
  store.setActiveWeek(props.weekStart);
  cancelAdd();
  editingId.value = item.id;
  editLineDraft.value = formatWeeklyFocusLine(item);
  editLineError.value = '';
  await nextTick();
  focusElAtEnd(resolveEditInput());
}

function cancelEdit(): void {
  editingId.value = null;
  editLineDraft.value = '';
  editLineError.value = '';
}

async function handleEditEnter(item: WeeklyFocus): Promise<void> {
  if (editingId.value !== item.id) return;
  if (isBlankOrBarePrefix(editLineDraft.value)) {
    cancelEdit();
    store.requestDeleteFocus(item);
    return;
  }

  const parsed = parseWeeklyFocusLine(editLineDraft.value);
  if (!parsed.ok) {
    editLineError.value = parsed.error;
    return;
  }

  await store.saveFocus({
    id: item.id,
    weekStart: item.weekStart,
    title: parsed.title,
    targetText: parsed.targetText,
    statusNote: parsed.statusNote,
    isDone: parsed.isDone,
    sortOrder: item.sortOrder,
  });
  cancelEdit();
}

async function handleEditBlur(item: WeeklyFocus): Promise<void> {
  if (editingId.value !== item.id) return;
  if (isBlankOrBarePrefix(editLineDraft.value)) {
    cancelEdit();
    return;
  }

  const parsed = parseWeeklyFocusLine(editLineDraft.value);
  if (!parsed.ok) {
    editLineError.value = parsed.error;
    return;
  }

  await store.saveFocus({
    id: item.id,
    weekStart: item.weekStart,
    title: parsed.title,
    targetText: parsed.targetText,
    statusNote: parsed.statusNote,
    isDone: parsed.isDone,
    sortOrder: item.sortOrder,
  });
  cancelEdit();
}
</script>

<template>
  <div class="focus-strip" @click="openAddForm()">
    <div class="focus-label" @click.stop="openAddForm()">
      <Target :size="12.5" :stroke-width="2" />
      <span>周重点</span>
    </div>

    <div class="focus-content">
      <ul v-if="items.length > 0" ref="focusListRef" class="focus-list">
        <li
          v-for="item in items"
          :key="item.id"
          :data-drag-id="item.id"
          class="focus-row"
          :class="{
            'is-done': item.isDone,
            'is-editing': editingId === item.id,
            'is-dragging': draggingId === item.id,
            'drag-over-before': dropIndicator?.id === item.id && dropIndicator.position === 'before',
            'drag-over-after': dropIndicator?.id === item.id && dropIndicator.position === 'after',
          }"
          @pointerdown="onRowPointerDown(item.id, $event)"
          @click.stop
        >
          <div v-if="editingId === item.id" class="focus-line-box" data-no-drag>
            <input
              ref="editLineInput"
              v-model="editLineDraft"
              type="text"
              class="doc-line-input"
              :class="{ 'has-error': Boolean(editLineError) }"
              placeholder="【】任务名 @目标时间 - 状态备注"
              @input="editLineError = ''"
              @keydown.enter.prevent="handleEditEnter(item)"
              @keydown.esc.stop="cancelEdit()"
              @blur="handleEditBlur(item)"
            />
            <p v-if="editLineError" class="inline-error">{{ editLineError }}</p>
          </div>

          <template v-else>
            <button
              type="button"
              class="check-box"
              :class="{ checked: item.isDone }"
              :title="item.isDone ? '取消完成' : '完成'"
              :aria-label="item.isDone ? '取消完成' : '标记完成'"
              @click.stop="store.toggleFocusDone(item)"
              @dblclick.stop
            >
              <Check v-if="item.isDone" :size="10" :stroke-width="3" />
              <Check v-else :size="9" :stroke-width="2.5" class="check-preview" />
            </button>

            <div class="focus-main" @dblclick.stop="startEdit(item)">
              <span class="focus-name">{{ item.title }}</span>
              <span v-if="item.targetText" class="target-chip">{{ item.targetText }}</span>
              <span v-if="item.statusNote" class="status-note">{{ item.statusNote }}</span>
            </div>

            <div class="row-actions" @dblclick.stop>
              <button
                type="button"
                class="icon-btn check-action"
                :class="{ active: item.isDone }"
                :title="item.isDone ? '取消完成' : '完成'"
                :aria-label="item.isDone ? '取消完成' : '完成'"
                @click.stop="store.toggleFocusDone(item)"
              >
                <Check :size="12" :stroke-width="2.4" />
              </button>
              <button
                type="button"
                class="icon-btn danger"
                title="删除"
                aria-label="删除"
                @click.stop="store.requestDeleteFocus(item)"
              >
                <Trash2 :size="12" />
              </button>
            </div>
          </template>
        </li>
      </ul>

      <div v-if="isAdding" class="focus-add-wrap" @click.stop>
        <div class="focus-line-box">
          <input
            ref="addLineInput"
            v-model="addLineDraft"
            type="text"
            class="doc-line-input"
            :class="{ 'has-error': Boolean(addLineError) }"
            placeholder="【】任务名 @目标时间 - 状态备注"
            @input="addLineError = ''"
            @keydown.enter.prevent="handleAddLineEnter()"
            @keydown.esc.stop="cancelAdd()"
            @blur="handleAddLineBlur()"
          />
          <p v-if="addLineError" class="inline-error">{{ addLineError }}</p>
        </div>
      </div>

      <div v-else class="focus-ghost-line" :class="{ 'is-empty': items.length === 0 }">
        {{ items.length === 0 ? '【】周重点 @时间 - 备注' : '【】添加重点' }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.focus-strip {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 9px 16px;
  border-bottom: 1px solid var(--border-hairline);
  background: var(--bg-surface-subtle);
  cursor: text;
}

.focus-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding-top: 4px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-secondary);
  white-space: nowrap;
  flex-shrink: 0;
  cursor: pointer;
}

.focus-label svg {
  color: var(--accent);
}

.focus-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.focus-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.focus-row {
  display: flex;
  align-items: center;
  gap: 7px;
  min-height: 25px;
  padding: 2.5px 6px;
  border-radius: var(--radius-xs);
  cursor: grab;
  transition: background-color 0.12s ease;
}

.focus-row:active {
  cursor: grabbing;
}

.focus-row.is-editing {
  padding: 0;
  cursor: default;
}

.focus-row:hover:not(.is-editing) {
  background: var(--bg-hover);
}

.focus-row .check-box {
  width: 14px;
  height: 14px;
}

.focus-row .row-actions {
  opacity: 0;
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: auto;
  transition: opacity 0.12s ease;
}

.focus-row:hover .row-actions {
  opacity: 1;
}

.focus-main {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  flex: 1;
  min-width: 0;
}

.focus-name {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-primary);
}

.focus-row.is-done .focus-name {
  color: var(--text-tertiary);
  text-decoration: line-through;
}

.target-chip {
  display: inline-flex;
  align-items: center;
  padding: 0 7px;
  height: 18px;
  border-radius: var(--radius-pill);
  background: var(--accent-soft);
  border: 1px solid var(--accent-border);
  color: var(--accent);
  font-size: 11px;
  font-weight: 500;
}

.focus-row.is-done .target-chip {
  background: var(--bg-muted);
  border-color: transparent;
  color: var(--text-tertiary);
  text-decoration: line-through;
}

.status-note {
  font-size: 11px;
  color: var(--warning);
  background: var(--warning-soft);
  border: 1px solid var(--warning-border);
  padding: 0 7px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  border-radius: var(--radius-pill);
  font-weight: 500;
}

.focus-row.is-done .status-note {
  background: var(--bg-muted);
  border-color: transparent;
  color: var(--text-tertiary);
  text-decoration: line-through;
}

.focus-ghost-line {
  padding: 1px 6px;
  font-size: 11px;
  color: var(--text-placeholder);
  opacity: 0;
  transition: opacity 0.14s ease, color 0.14s ease;
  user-select: none;
}

.focus-ghost-line.is-empty {
  opacity: 0.72;
}

.focus-strip:hover .focus-ghost-line {
  opacity: 1;
  color: var(--text-tertiary);
}

.focus-add-wrap {
  width: 100%;
  padding-top: 2px;
}

.focus-line-box {
  width: 100%;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  background: var(--bg-surface);
  border: 1px solid var(--accent-border);
  box-shadow: 0 0 0 2.5px var(--accent-ring);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.doc-line-input {
  width: 100%;
  border: none;
  background: transparent;
  padding: 2px 0;
  font-size: 12.5px;
  color: var(--text-primary);
  outline: none;
}

.doc-line-input::placeholder {
  color: var(--text-tertiary);
}

.doc-line-input.has-error {
  color: var(--danger);
}

.inline-error {
  width: 100%;
  margin: 0;
  font-size: 11.5px;
  color: var(--danger);
}
</style>
