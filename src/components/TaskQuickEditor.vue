<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { parseShorthandTask, parseTimePart } from '@/core/timeParser';
import type { DailyTask } from '@/types/schedule';

const props = withDefaults(
  defineProps<{
    task?: DailyTask | null;
    compact?: boolean;
    autoFocus?: boolean;
  }>(),
  {
    task: null,
    compact: false,
    autoFocus: true,
  }
);

const emit = defineEmits<{
  submit: [payload: { startTime: string; endTime: string; title: string; isDone?: boolean }];
  cancel: [];
}>();

const mode = ref<'shorthand' | 'fields'>(props.task ? 'fields' : 'shorthand');
const shorthandRaw = ref('');
const startRaw = ref(props.task?.startTime ?? '');
const endRaw = ref(props.task?.endTime ?? '');
const titleRaw = ref(props.task?.title ?? '');
const submitAttempted = ref(false);

const shorthandInputRef = ref<HTMLInputElement | null>(null);
const startInputRef = ref<HTMLInputElement | null>(null);

watch(
  () => props.task,
  (next) => {
    if (next) {
      mode.value = 'fields';
      startRaw.value = next.startTime;
      endRaw.value = next.endTime;
      titleRaw.value = next.title;
      shorthandRaw.value = `${next.startTime}-${next.endTime}|${next.title}`;
    } else {
      mode.value = 'shorthand';
      shorthandRaw.value = '';
      startRaw.value = '';
      endRaw.value = '';
      titleRaw.value = '';
    }
    submitAttempted.value = false;
  }
);

onMounted(async () => {
  if (!props.autoFocus) return;
  await nextTick();
  if (mode.value === 'shorthand') {
    shorthandInputRef.value?.focus();
  } else {
    startInputRef.value?.focus();
  }
});

const shorthandValidation = computed(() => {
  const val = shorthandRaw.value;
  if (!val.trim()) {
    return {
      ok: false as const,
      error: submitAttempted.value ? '请输入如 【】9-10｜周会' : '',
      preview: '',
    };
  }
  const parsed = parseShorthandTask(val);
  if (parsed.ok) {
    return {
      ok: true as const,
      startTime: parsed.startTime,
      endTime: parsed.endTime,
      title: parsed.title,
      isDone: parsed.isDone,
      preview: `${parsed.startTime} - ${parsed.endTime} · ${parsed.title}`,
      error: '',
    };
  }
  return {
    ok: false as const,
    error: parsed.error,
    preview: '',
  };
});

const fieldsValidation = computed(() => {
  const hasAnyInput =
    startRaw.value.trim() !== '' || endRaw.value.trim() !== '' || titleRaw.value.trim() !== '';

  if (!hasAnyInput && !submitAttempted.value) {
    return { ok: false as const, error: '', preview: '' };
  }

  const s = parseTimePart(startRaw.value);
  if (!s.ok) {
    return { ok: false as const, error: `起始时间：${s.error}`, preview: '' };
  }
  const e = parseTimePart(endRaw.value);
  if (!e.ok) {
    return { ok: false as const, error: `结束时间：${e.error}`, preview: '' };
  }
  if (e.minutes <= s.minutes) {
    return {
      ok: false as const,
      error: '结束时间必须晚于起始时间，且不支持跨天',
      preview: '',
    };
  }
  const title = titleRaw.value.trim();
  if (!title) {
    return {
      ok: false as const,
      error: submitAttempted.value ? '任务名称不能为空' : '',
      preview: `${s.normalized} - ${e.normalized}`,
    };
  }
  return {
    ok: true as const,
    startTime: s.normalized,
    endTime: e.normalized,
    title,
    preview: `${s.normalized} - ${e.normalized} · ${title}`,
    error: '',
  };
});

async function switchMode(nextMode: 'shorthand' | 'fields'): Promise<void> {
  if (mode.value === nextMode) return;
  if (nextMode === 'fields' && shorthandValidation.value.ok) {
    startRaw.value = shorthandValidation.value.startTime;
    endRaw.value = shorthandValidation.value.endTime;
    titleRaw.value = shorthandValidation.value.title;
  } else if (nextMode === 'shorthand' && fieldsValidation.value.ok) {
    shorthandRaw.value = `${fieldsValidation.value.startTime}-${fieldsValidation.value.endTime}|${fieldsValidation.value.title}`;
  }
  mode.value = nextMode;
  submitAttempted.value = false;
  await nextTick();
  if (nextMode === 'shorthand') {
    shorthandInputRef.value?.focus();
  } else {
    startInputRef.value?.focus();
  }
}

function handleSubmit(): void {
  submitAttempted.value = true;
  if (mode.value === 'shorthand') {
    const res = shorthandValidation.value;
    if (!res.ok) return;
    emit('submit', {
      startTime: res.startTime,
      endTime: res.endTime,
      title: res.title,
      isDone: res.isDone,
    });
    if (!props.task) {
      shorthandRaw.value = '';
      submitAttempted.value = false;
    }
  } else {
    const res = fieldsValidation.value;
    if (!res.ok) return;
    emit('submit', {
      startTime: res.startTime,
      endTime: res.endTime,
      title: res.title,
    });
    if (!props.task) {
      startRaw.value = '';
      endRaw.value = '';
      titleRaw.value = '';
      submitAttempted.value = false;
    }
  }
}

function handleCancel(): void {
  emit('cancel');
}
</script>

<template>
  <div
    class="task-editor"
    :class="{ 'is-compact': compact }"
    @keydown.esc.stop="handleCancel()"
  >
    <div class="editor-head">
      <span class="editor-title">{{ task ? '编辑时间段任务' : '新增时间段任务' }}</span>
      <div class="mode-switch">
        <button
          type="button"
          class="mode-btn"
          :class="{ active: mode === 'shorthand' }"
          @click="switchMode('shorthand')"
        >
          简写
        </button>
        <button
          type="button"
          class="mode-btn"
          :class="{ active: mode === 'fields' }"
          @click="switchMode('fields')"
        >
          分字段
        </button>
      </div>
    </div>

    <div v-if="mode === 'shorthand'" class="editor-body">
      <input
        ref="shorthandInputRef"
        v-model="shorthandRaw"
        type="text"
        class="field-input"
        :class="{ 'is-error': Boolean(shorthandValidation.error) }"
        placeholder="【】9-10｜周会 或 10:30-11:30|评审"
        @keydown.enter.prevent="handleSubmit()"
      />
      <p v-if="shorthandValidation.error" class="feedback error">
        {{ shorthandValidation.error }}
      </p>
      <p v-else-if="shorthandValidation.preview" class="feedback valid tabular-nums">
        识别：{{ shorthandValidation.preview }}
      </p>
      <p v-else class="feedback hint">支持 【】/【x】 前缀及半角 | 或全角 ｜，回车保存</p>
    </div>

    <div v-else class="editor-body">
      <div class="fields-row" :class="{ stacked: compact }">
        <div class="time-pair">
          <input
            ref="startInputRef"
            v-model="startRaw"
            type="text"
            class="field-input time-input tabular-nums"
            :class="{ 'is-error': Boolean(fieldsValidation.error) }"
            placeholder="9 或 09:30"
            aria-label="起始时间"
            @keydown.enter.prevent="handleSubmit()"
          />
          <span class="time-sep">-</span>
          <input
            v-model="endRaw"
            type="text"
            class="field-input time-input tabular-nums"
            :class="{ 'is-error': Boolean(fieldsValidation.error) }"
            placeholder="10 或 11:30"
            aria-label="结束时间"
            @keydown.enter.prevent="handleSubmit()"
          />
        </div>
        <input
          v-model="titleRaw"
          type="text"
          class="field-input title-input"
          :class="{ 'is-error': Boolean(fieldsValidation.error) && !titleRaw.trim() }"
          placeholder="任务名称"
          aria-label="任务名称"
          @keydown.enter.prevent="handleSubmit()"
        />
      </div>
      <p v-if="fieldsValidation.error" class="feedback error">
        {{ fieldsValidation.error }}
      </p>
      <p v-else-if="fieldsValidation.preview" class="feedback valid tabular-nums">
        {{ fieldsValidation.preview }}
      </p>
      <p v-else class="feedback hint">填写起始、结束时间与任务名，回车保存</p>
    </div>

    <div class="editor-foot">
      <button type="button" class="btn btn-primary" @click="handleSubmit()">
        {{ task ? '保存' : '添加' }}
      </button>
      <button type="button" class="btn" @click="handleCancel()">取消</button>
    </div>
  </div>
</template>

<style scoped>
.task-editor {
  background: var(--bg-surface);
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-md);
  padding: 10px;
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.task-editor.is-compact {
  padding: 8px;
}

.editor-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.editor-title {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-secondary);
}

.mode-switch {
  display: inline-flex;
  padding: 1px;
  border-radius: var(--radius-xs);
  background: var(--bg-muted);
  border: 1px solid var(--border-hairline);
}

.mode-btn {
  border: none;
  background: transparent;
  padding: 2px 7px;
  font-size: 11px;
  border-radius: 3px;
  color: var(--text-tertiary);
}

.mode-btn.active {
  background: var(--bg-surface);
  color: var(--text-primary);
  font-weight: 600;
  box-shadow: var(--shadow-xs);
}

.editor-body {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.fields-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.fields-row.stacked {
  flex-direction: column;
  align-items: stretch;
}

.time-pair {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.time-input {
  width: 78px;
  height: 30px;
  padding: 0 7px;
  font-size: 12.5px;
}

.fields-row.stacked .time-input {
  flex: 1;
  width: auto;
}

.time-sep {
  color: var(--text-tertiary);
  font-size: 12px;
}

.title-input {
  flex: 1;
  height: 30px;
  font-size: 12.5px;
}

.task-editor.is-compact .field-input {
  height: 29px;
  font-size: 12.5px;
}

.feedback {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.35;
}

.feedback.error {
  color: var(--danger);
}

.feedback.valid {
  color: var(--success);
}

.feedback.hint {
  color: var(--text-tertiary);
}

.editor-foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
}

.editor-foot .btn {
  height: 26px;
  padding: 0 10px;
  font-size: 12px;
}
</style>
