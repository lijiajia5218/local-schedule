<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  ArrowUpCircle,
  Database,
  FolderOpen,
  HardDrive,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-vue-next';
import { isTauriRuntime } from '@/services/scheduleApi';
import { useScheduleStore } from '@/stores/scheduleStore';
import { useUpdaterStore } from '@/stores/updaterStore';

const emit = defineEmits<{
  close: [];
  openExport: [];
}>();

const store = useScheduleStore();
const updater = useUpdaterStore();
const dirInput = ref(store.settings.dataDir);
const saving = ref(false);
const errorMsg = ref('');
const isDesktop = computed(() => isTauriRuntime());
const runtimeMode = computed(() =>
  isDesktop.value ? '桌面本地 SQLite 模式' : '浏览器预览模式（LocalStorage 持久化）'
);

async function saveDataDir(): Promise<void> {
  const next = dirInput.value.trim();
  if (!next) {
    errorMsg.value = '数据目录路径不能为空';
    return;
  }
  saving.value = true;
  errorMsg.value = '';
  try {
    await store.updateDataDir(next);
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : '更新目录失败';
  } finally {
    saving.value = false;
  }
}

function jumpToExport(): void {
  emit('close');
  emit('openExport');
}
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <div class="modal-card" role="dialog" aria-modal="true" aria-label="设置">
      <header class="modal-header">
        <div>
          <h2 class="modal-title">设置</h2>
          <p class="modal-subtitle">数据纯本地存储</p>
        </div>
        <button type="button" class="icon-btn" title="关闭" @click="emit('close')">
          <X :size="16" />
        </button>
      </header>

      <div class="modal-body">
        <div class="runtime-banner">
          <ShieldCheck :size="15" />
          <span>{{ runtimeMode }}</span>
        </div>

        <div class="setting-group">
          <label class="setting-label" for="data-dir-input">
            <FolderOpen :size="14" />
            <span>本地数据目录</span>
          </label>
          <p class="setting-desc">
            修改并保存后将自动搬迁 <code>data.sqlite</code> 与 <code>exports</code>。
          </p>
          <div class="dir-row">
            <input
              id="data-dir-input"
              v-model="dirInput"
              type="text"
              class="field-input mono"
              placeholder="~/Documents/本地日程"
              @keydown.enter.prevent="saveDataDir()"
            />
            <button
              type="button"
              class="btn btn-primary"
              :disabled="saving"
              @click="saveDataDir()"
            >
              {{ saving ? '搬迁中…' : '保存目录' }}
            </button>
          </div>
          <p v-if="errorMsg" class="err-msg">{{ errorMsg }}</p>
        </div>

        <div class="info-card">
          <div class="info-row">
            <span class="info-key">
              <Database :size="13" />
              数据库文件
            </span>
            <span class="info-val mono">{{ store.settings.dbPath }}</span>
          </div>
          <div class="info-row">
            <span class="info-key">
              <HardDrive :size="13" />
              导出文件夹
            </span>
            <span class="info-val mono">{{ store.settings.exportsDir }}</span>
          </div>
          <div class="info-row">
            <span class="info-key">数据结构版本</span>
            <span class="info-val tabular-nums">v{{ store.settings.schemaVersion }}</span>
          </div>
        </div>

        <div class="update-card">
          <div class="update-head">
            <div class="update-title-wrap">
              <ArrowUpCircle :size="14" />
              <span class="update-title">软件版本与更新</span>
              <span class="version-tag tabular-nums">v{{ updater.currentVersion }}</span>
            </div>
            <button
              type="button"
              class="btn"
              :disabled="updater.status === 'checking' || updater.status === 'downloading'"
              @click="updater.checkForUpdates({ silent: false })"
            >
              <RefreshCw
                :size="13"
                :class="{ spinning: updater.status === 'checking' }"
              />
              <span>{{ updater.status === 'checking' ? '检查中…' : '检查更新' }}</span>
            </button>
          </div>

          <p v-if="updater.status === 'up-to-date'" class="update-status ok">
            当前已是最新版本。
          </p>
          <p v-else-if="updater.status === 'unsupported'" class="update-status">
            仅桌面客户端支持自动检查与原地更新。
          </p>
          <p v-else-if="updater.status === 'error'" class="update-status err">
            {{ updater.errorMessage }}
          </p>

          <div
            v-else-if="updater.status === 'available' || updater.status === 'downloading'"
            class="update-available-box"
          >
            <div class="update-available-row">
              <span class="new-ver-label">发现新版本 v{{ updater.availableVersion }}</span>
              <button
                type="button"
                class="btn btn-primary"
                :disabled="updater.status === 'downloading'"
                @click="updater.downloadAndInstallUpdate()"
              >
                {{
                  updater.status === 'downloading'
                    ? updater.downloadProgress !== null
                      ? `下载中 ${updater.downloadProgress}%`
                      : '下载并安装中…'
                    : '立即更新并重启'
                }}
              </button>
            </div>
            <p v-if="updater.releaseNotes" class="release-notes">
              {{ updater.releaseNotes }}
            </p>
            <div
              v-if="updater.status === 'downloading' && updater.downloadProgress !== null"
              class="progress-track"
            >
              <div
                class="progress-fill"
                :style="{ width: `${updater.downloadProgress}%` }"
              />
            </div>
          </div>
        </div>

        <div class="footer-row">
          <button type="button" class="btn" @click="jumpToExport()">
            打开导出与 JSON 备份…
          </button>
          <button type="button" class="btn btn-primary" @click="emit('close')">完成</button>
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
  background: rgba(15, 23, 42, 0.32);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.modal-card {
  width: 100%;
  max-width: 560px;
  background: var(--bg-surface);
  border: 1px solid var(--border-hairline);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
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

.modal-body {
  padding: 16px 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.runtime-banner {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 8px 12px;
  border-radius: var(--radius-md);
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 12.5px;
  font-weight: 500;
}

.setting-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.setting-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.setting-desc {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.setting-desc code {
  font-family: var(--font-mono);
  background: var(--bg-muted);
  padding: 1px 4px;
  border-radius: var(--radius-xs);
}

.dir-row {
  display: flex;
  gap: 8px;
}

.mono {
  font-family: var(--font-mono);
  font-size: 12px;
}

.err-msg {
  margin: 0;
  font-size: 12px;
  color: var(--danger);
}

.info-card,
.update-card {
  padding: 12px 14px;
  border-radius: var(--radius-md);
  background: var(--bg-surface-subtle);
  border: 1px solid var(--border-hairline);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 12.5px;
}

.info-key {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.info-val {
  color: var(--text-primary);
  text-align: right;
  word-break: break-all;
}

.update-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.update-title-wrap {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-primary);
}

.update-title {
  font-size: 13px;
  font-weight: 600;
}

.version-tag {
  font-size: 11px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: var(--radius-pill);
  background: var(--bg-muted);
  color: var(--text-secondary);
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.update-status {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.update-status.ok {
  color: var(--success);
}

.update-status.err {
  color: var(--danger);
}

.update-available-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 6px;
  border-top: 1px solid var(--border-subtle);
}

.update-available-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.new-ver-label {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--accent);
}

.release-notes {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-secondary);
  white-space: pre-line;
}

.progress-track {
  width: 100%;
  height: 5px;
  border-radius: var(--radius-pill);
  background: var(--bg-muted);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--accent);
  transition: width 0.16s ease;
}

.footer-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 4px;
}
</style>
