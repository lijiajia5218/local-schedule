<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { Check, Columns2, Pencil, Target, Trash2 } from 'lucide-vue-next';
import { formatWeeklyFocusLine, parseWeeklyFocusLine } from '@/core/timeParser';
import { useScheduleStore } from '@/stores/scheduleStore';
import type { WeeklyFocus } from '@/types/schedule';

const props = defineProps<{
  weekStart: string;
}>();

const store = useScheduleStore();
const items = computed(() => store.focusesForWeek(props.weekStart));

const isAdding = ref(false);
const addLineMode = ref<'line' | 'fields'>('line');
const addLineDraft = ref('');
const addLineAttempted = ref(false);
const addLineInput = ref<HTMLInputElement | null>(null);

const addTitle = ref('');
const addTarget = ref('');
const addNote = ref('');
const addFieldsError = ref('');
const addTitleInput = ref<HTMLInputElement | null>(null);

const editingId = ref<string | null>(null);
const editMode = ref<'line' | 'fields'>('line');
const editLineDraft = ref('');
const editLineAttempted = ref(false);
const editTitle = ref('');
const editTarget = ref('');
const editNote = ref('');
const editError = ref('');

const addLineParsed = computed(() => {
  if (!addLineDraft.value.trim()) return null;
  return parseWeeklyFocusLine(addLineDraft.value);
});

const addLineError = computed(() => {
  const parsed = addLineParsed.value;
  if (!parsed) return '';
  if (!parsed.ok && (addLineAttempted.value || addLineDraft.value.trim().length > 0)) {
    return parsed.error;
  }
  return '';
});

const editLineParsed = computed(() => {
  if (!editLineDraft.value.trim()) return null;
  return parseWeeklyFocusLine(editLineDraft.value);
});

const editLineError = computed(() => {
  const parsed = editLineParsed.value;
  if (!parsed) return editLineAttempted.value ? '周重点不能为空' : '';
  if (!parsed.ok) return parsed.error;
  return '';
});

async function openAddForm(): Promise<void> {
  store.setActiveWeek(props.weekStart);
  isAdding.value = true;
  addLineMode.value = 'line';
  editingId.value = null;
  addLineAttempted.value = false;
  addFieldsError.value = '';
  await nextTick();
  addLineInput.value?.focus();
}

function cancelAdd(): void {
  isAdding.value = false;
  addLineDraft.value = '';
  addLineAttempted.value = false;
  addTitle.value = '';
  addTarget.value = '';
  addNote.value = '';
  addFieldsError.value = '';
}

async function toggleAddMode(): Promise<void> {
  if (addLineMode.value === 'line') {
    const parsed = addLineParsed.value;
    if (parsed && parsed.ok) {
      addTitle.value = parsed.title;
      addTarget.value = parsed.targetText ?? '';
      addNote.value = parsed.statusNote ?? '';
    }
    addLineMode.value = 'fields';
    await nextTick();
    addTitleInput.value?.focus();
  } else {
    if (addTitle.value.trim()) {
      addLineDraft.value = formatWeeklyFocusLine({
        title: addTitle.value.trim(),
        targetText: addTarget.value.trim() || null,
        statusNote: addNote.value.trim() || null,
        isDone: false,
      });
    }
    addLineMode.value = 'line';
    await nextTick();
    addLineInput.value?.focus();
  }
}

async function submitAddLine(keepOpen: boolean): Promise<boolean> {
  if (!addLineDraft.value.trim()) {
    if (!keepOpen) cancelAdd();
    return true;
  }
  const parsed = parseWeeklyFocusLine(addLineDraft.value);
  if (!parsed.ok) {
    addLineAttempted.value = true;
    return false;
  }
  await store.saveFocus({
    weekStart: props.weekStart,
    title: parsed.title,
    targetText: parsed.targetText,
    statusNote: parsed.statusNote,
    isDone: parsed.isDone,
  });
  addLineDraft.value = '';
  addLineAttempted.value = false;
  if (!keepOpen) {
    isAdding.value = false;
  } else {
    await nextTick();
    addLineInput.value?.focus();
  }
  return true;
}

async function handleAddLineEnter(): Promise<void> {
  if (!addLineDraft.value.trim()) {
    cancelAdd();
    return;
  }
  await submitAddLine(true);
}

async function handleAddLineBlur(): Promise<void> {
  if (!isAdding.value || addLineMode.value !== 'line') return;
  if (!addLineDraft.value.trim()) {
    cancelAdd();
    return;
  }
  const parsed = parseWeeklyFocusLine(addLineDraft.value);
  if (!parsed.ok) {
    addLineAttempted.value = true;
    return;
  }
  await submitAddLine(false);
}

async function submitAddFields(): Promise<void> {
  const title = addTitle.value.trim();
  if (!title) {
    addFieldsError.value = '请输入重点待办名称';
    return;
  }
  try {
    await store.saveFocus({
      weekStart: props.weekStart,
      title,
      targetText: addTarget.value.trim() || null,
      statusNote: addNote.value.trim() || null,
      isDone: false,
    });
    cancelAdd();
  } catch (err) {
    addFieldsError.value = err instanceof Error ? err.message : '保存失败';
  }
}

function startEdit(item: WeeklyFocus): void {
  store.setActiveWeek(props.weekStart);
  isAdding.value = false;
  editingId.value = item.id;
  editMode.value = 'line';
  editLineDraft.value = formatWeeklyFocusLine(item);
  editLineAttempted.value = false;
  editTitle.value = item.title;
  editTarget.value = item.targetText ?? '';
  editNote.value = item.statusNote ?? '';
  editError.value = '';
}

function cancelEdit(): void {
  editingId.value = null;
  editError.value = '';
  editLineAttempted.value = false;
}

function toggleEditMode(): void {
  if (editMode.value === 'line') {
    const parsed = editLineParsed.value;
    if (parsed && parsed.ok) {
      editTitle.value = parsed.title;
      editTarget.value = parsed.targetText ?? '';
      editNote.value = parsed.statusNote ?? '';
    }
    editMode.value = 'fields';
  } else {
    if (editTitle.value.trim()) {
      editLineDraft.value = formatWeeklyFocusLine({
        title: editTitle.value.trim(),
        targetText: editTarget.value.trim() || null,
        statusNote: editNote.value.trim() || null,
        isDone: false,
      });
    }
    editMode.value = 'line';
  }
}

async function submitEditLine(item: WeeklyFocus): Promise<void> {
  editLineAttempted.value = true;
  const parsed = parseWeeklyFocusLine(editLineDraft.value);
  if (!parsed.ok) return;
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

async function submitEditFields(item: WeeklyFocus): Promise<void> {
  const title = editTitle.value.trim();
  if (!title) {
    editError.value = '任务名不能为空';
    return;
  }
  try {
    await store.saveFocus({
      id: item.id,
      weekStart: item.weekStart,
      title,
      targetText: editTarget.value.trim() || null,
      statusNote: editNote.value.trim() || null,
      isDone: item.isDone,
      sortOrder: item.sortOrder,
    });
    cancelEdit();
  } catch (err) {
    editError.value = err instanceof Error ? err.message : '更新失败';
  }
}
</script>

<template>
  <div class="focus-strip" @click="openAddForm()">
    <div class="focus-label" @click.stop="openAddForm()">
      <Target :size="12" />
      <span>周重点</span>
    </div>

    <div class="focus-content">
      <ul v-if="items.length > 0" class="focus-list">
        <li
          v-for="item in items"
          :key="item.id"
          class="focus-row"
          :class="{ 'is-done': item.isDone, 'is-editing': editingId === item.id }"
          @click.stop
        >
          <template v-if="editingId === item.id">
            <div
              v-if="editMode === 'line'"
              class="focus-line-box"
              @keydown.esc.stop="cancelEdit()"
            >
              <div class="focus-line-input-row">
                <input
                  v-model="editLineDraft"
                  type="text"
                  class="doc-line-input"
                  :class="{ 'has-error': Boolean(editLineError) }"
                  placeholder="【】任务名 @目标时间 - 状态备注"
                  autofocus
                  @keydown.enter.prevent="submitEditLine(item)"
                />
                <button
                  type="button"
                  class="mode-icon-btn"
                  title="切换分字段编辑"
                  @mousedown.prevent="toggleEditMode()"
                >
                  <Columns2 :size="12" />
                </button>
                <button type="button" class="btn btn-primary mini" @click="submitEditLine(item)">
                  保存
                </button>
                <button type="button" class="btn mini" @click="cancelEdit()">取消</button>
              </div>
              <p v-if="editLineError" class="inline-error">{{ editLineError }}</p>
            </div>

            <div v-else class="focus-edit-row" @keydown.esc.stop="cancelEdit()">
              <input
                v-model="editTitle"
                type="text"
                class="field-input focus-edit-title"
                placeholder="重点待办任务名（必填）"
                autofocus
                @keydown.enter.prevent="submitEditFields(item)"
              />
              <input
                v-model="editTarget"
                type="text"
                class="field-input focus-edit-target"
                placeholder="目标时间，如 本周五"
                @keydown.enter.prevent="submitEditFields(item)"
              />
              <input
                v-model="editNote"
                type="text"
                class="field-input focus-edit-note"
                placeholder="状态备注，如 进行中"
                @keydown.enter.prevent="submitEditFields(item)"
              />
              <div class="focus-edit-actions">
                <button
                  type="button"
                  class="mode-icon-btn"
                  title="切换单行语法"
                  @mousedown.prevent="toggleEditMode()"
                >
                  <Columns2 :size="12" />
                </button>
                <button type="button" class="btn btn-primary" @click="submitEditFields(item)">
                  保存
                </button>
                <button type="button" class="btn" @click="cancelEdit()">取消</button>
              </div>
              <p v-if="editError" class="inline-error">{{ editError }}</p>
            </div>
          </template>

          <template v-else>
            <button
              type="button"
              class="check-box"
              :class="{ checked: item.isDone }"
              :aria-label="item.isDone ? '取消完成' : '标记完成'"
              @click.stop="store.toggleFocusDone(item)"
            >
              <Check v-if="item.isDone" :size="10" :stroke-width="3" />
            </button>

            <div class="focus-main" @dblclick.stop="startEdit(item)">
              <span class="focus-name">{{ item.title }}</span>
              <span v-if="item.targetText" class="target-chip">{{ item.targetText }}</span>
              <span v-if="item.statusNote" class="status-note">{{ item.statusNote }}</span>
            </div>

            <div class="row-actions">
              <button
                type="button"
                class="icon-btn"
                title="编辑"
                @click.stop="startEdit(item)"
              >
                <Pencil :size="12" />
              </button>
              <button
                type="button"
                class="icon-btn danger"
                title="删除"
                @click.stop="store.requestDeleteFocus(item)"
              >
                <Trash2 :size="12" />
              </button>
            </div>
          </template>
        </li>
      </ul>

      <div v-if="isAdding" class="focus-add-wrap" @click.stop @keydown.esc.stop="cancelAdd()">
        <div v-if="addLineMode === 'line'" class="focus-line-box">
          <div class="focus-line-input-row">
            <input
              ref="addLineInput"
              v-model="addLineDraft"
              type="text"
              class="doc-line-input"
              :class="{ 'has-error': Boolean(addLineError) }"
              placeholder="【】任务名 @目标时间 - 状态备注（如：【】方案评审 @周五 - 进行中）"
              @keydown.enter.prevent="handleAddLineEnter()"
              @blur="handleAddLineBlur()"
            />
            <button
              type="button"
              class="mode-icon-btn"
              title="切换分字段录入"
              @mousedown.prevent="toggleAddMode()"
            >
              <Columns2 :size="12" />
            </button>
          </div>
          <p v-if="addLineError" class="inline-error">{{ addLineError }}</p>
          <div v-else-if="addLineParsed && addLineParsed.ok" class="syntax-preview">
            <span class="preview-chip todo">{{ addLineParsed.isDone ? '已完成' : '待办' }}</span>
            <span class="preview-title">{{ addLineParsed.title }}</span>
            <span v-if="addLineParsed.targetText" class="target-chip">
              {{ addLineParsed.targetText }}
            </span>
            <span v-if="addLineParsed.statusNote" class="status-note">
              {{ addLineParsed.statusNote }}
            </span>
          </div>
          <p v-else class="syntax-hint">
            <code>【】标题</code> <code>@时间</code> <code>- 备注</code>
          </p>
        </div>

        <div v-else class="focus-add-bar">
          <input
            ref="addTitleInput"
            v-model="addTitle"
            type="text"
            class="field-input focus-edit-title"
            :class="{ 'is-error': addFieldsError }"
            placeholder="任务名（必填），回车保存"
            @keydown.enter.prevent="submitAddFields()"
          />
          <input
            v-model="addTarget"
            type="text"
            class="field-input focus-edit-target"
            placeholder="目标时间（如 本周五）"
            @keydown.enter.prevent="submitAddFields()"
          />
          <input
            v-model="addNote"
            type="text"
            class="field-input focus-edit-note"
            placeholder="状态备注（如 进行中）"
            @keydown.enter.prevent="submitAddFields()"
          />
          <div class="focus-edit-actions">
            <button
              type="button"
              class="mode-icon-btn"
              title="切换单行语法"
              @mousedown.prevent="toggleAddMode()"
            >
              <Columns2 :size="12" />
            </button>
            <button type="button" class="btn btn-primary" @click="submitAddFields()">添加</button>
            <button type="button" class="btn" @click="cancelAdd()">取消</button>
          </div>
          <p v-if="addFieldsError" class="inline-error">{{ addFieldsError }}</p>
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
  gap: 10px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-hairline);
  background: var(--bg-surface);
  cursor: text;
}

.focus-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding-top: 3px;
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
  gap: 1px;
}

.focus-row {
  display: flex;
  align-items: center;
  gap: 7px;
  min-height: 24px;
  padding: 2px 5px;
  border-radius: var(--radius-xs);
  cursor: default;
  transition: background-color 0.12s ease;
}

.focus-row:hover:not(.is-editing) {
  background: var(--bg-surface-subtle);
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
  padding: 0 6px;
  height: 18px;
  border-radius: var(--radius-pill);
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 11px;
  font-weight: 500;
}

.focus-row.is-done .target-chip {
  background: var(--bg-muted);
  color: var(--text-tertiary);
}

.status-note {
  font-size: 11px;
  color: var(--warning);
  background: var(--warning-soft);
  padding: 0 6px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  border-radius: var(--radius-pill);
}

.focus-row.is-done .status-note {
  background: var(--bg-muted);
  color: var(--text-tertiary);
}

.focus-ghost-line {
  padding: 1px 5px;
  font-size: 11px;
  color: var(--text-placeholder);
  opacity: 0;
  transition: opacity 0.14s ease, color 0.14s ease;
  user-select: none;
}

.focus-ghost-line.is-empty {
  opacity: 0.7;
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
  padding: 5px 8px;
  border-radius: var(--radius-sm);
  background: var(--accent-soft);
  border: 1px solid var(--accent-border);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.focus-line-input-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.doc-line-input {
  flex: 1;
  min-width: 0;
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

.mode-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
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

.btn.mini {
  height: 24px;
  padding: 0 8px;
  font-size: 11.5px;
}

.syntax-preview {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 11.5px;
}

.preview-chip.todo {
  padding: 0 6px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  border-radius: var(--radius-pill);
  background: var(--success-soft);
  color: var(--success);
  font-size: 10.5px;
  font-weight: 600;
}

.preview-title {
  font-weight: 500;
  color: var(--text-primary);
}

.syntax-hint {
  margin: 0;
  font-size: 11px;
  color: var(--text-tertiary);
}

.syntax-hint code {
  font-family: var(--font-mono);
  background: rgba(255, 255, 255, 0.75);
  padding: 0 4px;
  border-radius: 3px;
  color: var(--text-secondary);
}

.focus-add-bar,
.focus-edit-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 3px 0;
}

.focus-edit-title {
  flex: 2 1 180px;
  height: 28px;
  font-size: 12.5px;
}

.focus-edit-target {
  flex: 1 1 120px;
  height: 28px;
  font-size: 12.5px;
}

.focus-edit-note {
  flex: 1 1 130px;
  height: 28px;
  font-size: 12.5px;
}

.focus-edit-actions {
  display: flex;
  align-items: center;
  gap: 5px;
}

.focus-edit-actions .btn {
  height: 28px;
  font-size: 12px;
}

.inline-error {
  width: 100%;
  margin: 0;
  font-size: 11.5px;
  color: var(--danger);
}
</style>
