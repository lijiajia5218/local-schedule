<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  FileJson,
  FileText,
  Upload,
  X,
} from 'lucide-vue-next';
import { useScheduleStore } from '@/stores/scheduleStore';
import type { BackupPayload } from '@/types/schedule';

const emit = defineEmits<{
  close: [];
}>();

const store = useScheduleStore();
const activeTab = ref<'markdown' | 'json'>('markdown');
const copied = ref(false);
const busy = ref(false);

const pendingRestorePayload = ref<BackupPayload | null>(null);
const restoreFileName = ref('');
const restoreError = ref('');
const fileInputRef = ref<HTMLInputElement | null>(null);

const markdownPreview = computed(() => store.currentWeekMarkdown);

function downloadBrowserFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

async function copyMarkdown(): Promise<void> {
  try {
    await navigator.clipboard.writeText(markdownPreview.value);
    copied.value = true;
    store.pushToast('已复制本周 Markdown 到剪贴板', 'success');
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch {
    store.pushToast('剪贴板写入失败，请手动全选复制', 'error');
  }
}

async function exportMarkdownFile(): Promise<void> {
  busy.value = true;
  try {
    const res = await store.exportCurrentWeekMarkdown();
    if (res.path) {
      store.pushToast(`已导出 Markdown：${res.path}`, 'success');
    } else {
      downloadBrowserFile(
        `${store.currentWeekStart}.md`,
        res.content,
        'text/markdown;charset=utf-8'
      );
      store.pushToast(`已下载 ${store.currentWeekStart}.md`, 'success');
    }
  } catch (err) {
    store.pushToast(err instanceof Error ? err.message : '导出 Markdown 失败', 'error');
  } finally {
    busy.value = false;
  }
}

async function exportJsonFile(): Promise<void> {
  busy.value = true;
  try {
    const res = await store.exportJsonBackup();
    if (res.path) {
      store.pushToast(`已保存 JSON 备份：${res.path}`, 'success');
    } else {
      const jsonText = JSON.stringify(res.payload, null, 2);
      downloadBrowserFile(
        `local-schedule-backup-${store.currentWeekStart}.json`,
        jsonText,
        'application/json;charset=utf-8'
      );
      store.pushToast('已下载全量 JSON 备份', 'success');
    }
  } catch (err) {
    store.pushToast(err instanceof Error ? err.message : '导出 JSON 失败', 'error');
  } finally {
    busy.value = false;
  }
}

function triggerFilePick(): void {
  restoreError.value = '';
  fileInputRef.value?.click();
}

async function handleFileSelected(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;

  restoreError.value = '';
  try {
    const text = await file.text();
    const parsed = JSON.parse(text) as BackupPayload;
    if (
      !parsed ||
      !Array.isArray(parsed.weeklyFocus) ||
      !Array.isArray(parsed.dailyTask) ||
      !Array.isArray(parsed.dailyMemo)
    ) {
      restoreError.value = 'JSON 文件结构不符合本地日程备份格式';
      return;
    }
    pendingRestorePayload.value = parsed;
    restoreFileName.value = file.name;
  } catch {
    restoreError.value = '无法解析所选 JSON 文件，请确认文件内容完整有效';
  }
}

async function confirmRestore(): Promise<void> {
  if (!pendingRestorePayload.value) return;
  busy.value = true;
  try {
    await store.restoreJsonBackup(pendingRestorePayload.value);
    pendingRestorePayload.value = null;
    restoreFileName.value = '';
    emit('close');
  } catch (err) {
    restoreError.value = err instanceof Error ? err.message : '恢复失败';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <div class="modal-card" role="dialog" aria-modal="true" aria-label="导出与备份">
      <header class="modal-header">
        <div>
          <h2 class="modal-title">导出与备份</h2>
          <p class="modal-subtitle tabular-nums">{{ store.currentWeekStart }} 所在周</p>
        </div>
        <button type="button" class="icon-btn" title="关闭" @click="emit('close')">
          <X :size="16" />
        </button>
      </header>

      <div class="modal-tabs">
        <button
          type="button"
          class="tab-btn"
          :class="{ active: activeTab === 'markdown' }"
          @click="activeTab = 'markdown'"
        >
          <FileText :size="14" />
          <span>Markdown 周导出</span>
        </button>
        <button
          type="button"
          class="tab-btn"
          :class="{ active: activeTab === 'json' }"
          @click="activeTab = 'json'"
        >
          <FileJson :size="14" />
          <span>JSON 备份与恢复</span>
        </button>
      </div>

      <div v-if="activeTab === 'markdown'" class="modal-body">
        <pre class="md-preview">{{ markdownPreview }}</pre>

        <div class="modal-actions">
          <button type="button" class="btn" @click="copyMarkdown()">
            <Check v-if="copied" :size="14" />
            <Copy v-else :size="14" />
            <span>{{ copied ? '已复制' : '复制 Markdown' }}</span>
          </button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="busy"
            @click="exportMarkdownFile()"
          >
            <Download :size="14" />
            <span>导出 .md 文件</span>
          </button>
        </div>
      </div>

      <div v-else class="modal-body">
        <div class="backup-block">
          <div class="block-info">
            <h3>导出全量 JSON 备份</h3>
            <p>完整导出周重点待办、日时间段任务、日备忘三张业务表，用于迁移与容灾。</p>
          </div>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="busy"
            @click="exportJsonFile()"
          >
            <Download :size="14" />
            <span>导出 JSON 备份</span>
          </button>
        </div>

        <div class="divider" />

        <div class="backup-block vertical">
          <div class="block-info">
            <h3>从 JSON 备份全量恢复</h3>
            <p>覆盖式还原整库数据。恢复前建议先导出一份当前数据备份。</p>
          </div>

          <input
            ref="fileInputRef"
            type="file"
            accept=".json,application/json"
            style="display: none"
            @change="handleFileSelected"
          />

          <div v-if="!pendingRestorePayload" class="restore-picker">
            <button type="button" class="btn" @click="triggerFilePick()">
              <Upload :size="14" />
              <span>选择 JSON 备份文件…</span>
            </button>
          </div>

          <div v-else class="restore-confirm">
            <div class="warn-head">
              <AlertTriangle :size="16" />
              <span>确认覆盖恢复「{{ restoreFileName }}」？</span>
            </div>
            <p class="warn-detail tabular-nums">
              包含 {{ pendingRestorePayload.weeklyFocus.length }} 条周重点、
              {{ pendingRestorePayload.dailyTask.length }} 条日任务、
              {{ pendingRestorePayload.dailyMemo.length }} 条日备忘。当前全部数据将被替换。
            </p>
            <div class="warn-actions">
              <button
                type="button"
                class="btn btn-danger"
                :disabled="busy"
                @click="confirmRestore()"
              >
                确认覆盖恢复
              </button>
              <button
                type="button"
                class="btn"
                :disabled="busy"
                @click="pendingRestorePayload = null"
              >
                取消
              </button>
            </div>
          </div>

          <p v-if="restoreError" class="error-text">{{ restoreError }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: rgba(24, 28, 35, 0.28);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.modal-card {
  width: 100%;
  max-width: 640px;
  max-height: 85vh;
  background: var(--bg-surface);
  border: 1px solid var(--border-hairline);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 16px 20px 12px;
  border-bottom: 1px solid var(--border-subtle);
}

.modal-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
}

.modal-subtitle {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--text-tertiary);
}

.modal-tabs {
  display: flex;
  gap: 6px;
  padding: 10px 20px 0;
  border-bottom: 1px solid var(--border-subtle);
}

.tab-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 500;
}

.tab-btn.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
  font-weight: 600;
}

.modal-body {
  padding: 16px 20px 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.helper-text {
  margin: 0;
  font-size: 12.5px;
  color: var(--text-secondary);
}

.helper-text code {
  font-family: var(--font-mono);
  background: var(--bg-muted);
  padding: 1px 4px;
  border-radius: var(--radius-xs);
}

.md-preview {
  margin: 0;
  padding: 12px 14px;
  max-height: 310px;
  overflow: auto;
  background: var(--bg-surface-subtle);
  border: 1px solid var(--border-hairline);
  border-radius: var(--radius-md);
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.backup-block {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.backup-block.vertical {
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
}

.block-info h3 {
  margin: 0 0 3px;
  font-size: 14px;
  font-weight: 600;
}

.block-info p {
  margin: 0;
  font-size: 12.5px;
  color: var(--text-secondary);
}

.divider {
  height: 1px;
  background: var(--border-subtle);
}

.restore-confirm {
  padding: 12px 14px;
  border-radius: var(--radius-md);
  background: var(--danger-soft);
  border: 1px solid var(--danger-border);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.warn-head {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--danger);
  font-weight: 600;
  font-size: 13px;
}

.warn-detail {
  margin: 0;
  font-size: 12.5px;
  color: var(--text-secondary);
}

.warn-actions {
  display: flex;
  gap: 8px;
}

.error-text {
  margin: 0;
  font-size: 12.5px;
  color: var(--danger);
}
</style>
