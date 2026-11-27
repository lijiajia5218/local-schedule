<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import {
  ArrowUpCircle,
  Bell,
  Database,
  FolderOpen,
  HardDrive,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-vue-next';
import {
  checkNotificationPermission,
  requestNotificationPermission,
  type NotificationPermissionStatus,
} from '@/services/notificationHelper';
import { isTauriRuntime, scheduleApi } from '@/services/scheduleApi';
import { useScheduleStore } from '@/stores/scheduleStore';
import { useUpdaterStore } from '@/stores/updaterStore';

const emit = defineEmits<{
  close: [];
  openExport: [];
}>();

const store = useScheduleStore();
const updater = useUpdaterStore();
const dirInput = ref(store.settings.dataDir);
const leadMinutesInput = ref(store.settings.reminderLeadMinutes);
const closeToTrayInput = ref(store.settings.closeToTray);
const notifPerm = ref<NotificationPermissionStatus>('unsupported');
const deliveryError = ref<string | null>(null);

const saving = ref(false);
const savingReminderCfg = ref(false);
const errorMsg = ref('');
const reminderErrMsg = ref('');

const isDesktop = computed(() => isTauriRuntime());
const runtimeMode = computed(() =>
  isDesktop.value ? '桌面本地 SQLite 模式' : '浏览器预览模式（LocalStorage 持久化）'
);

const leadPresets = [
  { label: '准点', minutes: 0 },
  { label: '5 分钟', minutes: 5 },
  { label: '10 分钟', minutes: 10 },
  { label: '15 分钟', minutes: 15 },
  { label: '30 分钟', minutes: 30 },
];

const notifPermLabel = computed(() => {
  switch (notifPerm.value) {
    case 'granted':
      return '已授权';
    case 'denied':
      return '已被系统拒绝';
    case 'prompt':
      return '待授权';
    default:
      return '仅桌面端可用';
  }
});

watch(
  () => [store.settings.reminderLeadMinutes, store.settings.closeToTray],
  ([lead, tray]) => {
    leadMinutesInput.value = Number(lead);
    closeToTrayInput.value = Boolean(tray);
  }
);

onMounted(async () => {
  notifPerm.value = await checkNotificationPermission();
  deliveryError.value = await scheduleApi.getNotificationDeliveryError();
});

async function handleRequestNotifPermission(): Promise<void> {
  notifPerm.value = await requestNotificationPermission();
  deliveryError.value = await scheduleApi.getNotificationDeliveryError();
  if (notifPerm.value === 'granted') {
    store.pushToast('已开启系统通知权限', 'success');
  } else if (notifPerm.value === 'denied') {
    store.pushToast('系统通知已被拒绝，请在系统设置中开启', 'error');
  }
}

async function applyLeadPreset(minutes: number): Promise<void> {
  leadMinutesInput.value = minutes;
  await saveReminderAndTraySettings();
}

async function saveReminderAndTraySettings(): Promise<void> {
  const parsed = Number(leadMinutesInput.value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 1440) {
    reminderErrMsg.value = '提前提醒分钟数需为 0 至 1440 的整数';
    return;
  }
  savingReminderCfg.value = true;
  reminderErrMsg.value = '';
  try {
    await store.updateAppSettings(parsed, closeToTrayInput.value);
  } catch (err) {
    reminderErrMsg.value = err instanceof Error ? err.message : '保存设置失败';
  } finally {
    savingReminderCfg.value = false;
  }
}

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

        <div class="reminder-card">
          <div class="setting-label">
            <Bell :size="14" />
            <span>备忘提醒与窗口行为</span>
          </div>

          <div class="reminder-row">
            <div class="reminder-info">
              <span class="sub-label">备忘提前提醒时间</span>
              <span class="sub-desc">备忘含 <code>@9:00</code> 时将在到点前按设定分钟触发通知</span>
            </div>
            <div class="lead-input-wrap">
              <input
                v-model.number="leadMinutesInput"
                type="number"
                min="0"
                max="1440"
                step="1"
                class="field-input lead-input tabular-nums"
                @change="saveReminderAndTraySettings()"
              />
              <span class="unit-label">分钟</span>
            </div>
          </div>

          <div class="preset-row">
            <button
              v-for="p in leadPresets"
              :key="p.minutes"
              type="button"
              class="preset-chip"
              :class="{ active: leadMinutesInput === p.minutes }"
              :disabled="savingReminderCfg"
              @click="applyLeadPreset(p.minutes)"
            >
              {{ p.label }}
            </button>
          </div>
          <p v-if="reminderErrMsg" class="err-msg">{{ reminderErrMsg }}</p>

          <div class="perm-row">
            <div class="perm-meta">
              <span class="sub-label">系统通知权限</span>
              <span class="perm-badge" :class="`perm-${notifPerm}`">{{ notifPermLabel }}</span>
            </div>
            <button
              v-if="isDesktop && notifPerm !== 'granted'"
              type="button"
              class="btn"
              @click="handleRequestNotifPermission()"
            >
              请求通知权限
            </button>
          </div>
          <p v-if="notifPerm === 'denied'" class="perm-hint">
            系统已禁用通知权限。请前往系统「设置 → 通知」开启「本地日程」，窗口打开时仍会显示应用内提醒。
          </p>
          <p v-else-if="deliveryError" class="perm-hint">{{ deliveryError }}</p>

          <label class="tray-toggle-row">
            <div class="reminder-info">
              <span class="sub-label">关闭窗口时最小化到系统托盘</span>
              <span class="sub-desc">常驻后台以按时提醒备忘；macOS 下同步隐藏程序坞图标仅留顶部状态栏</span>
            </div>
            <input
              v-model="closeToTrayInput"
              type="checkbox"
              class="tray-checkbox"
              :disabled="savingReminderCfg"
              @change="saveReminderAndTraySettings()"
            />
          </label>
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
  max-width: 580px;
  max-height: 88vh;
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

.modal-body {
  padding: 16px 20px 20px;
  overflow-y: auto;
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

.reminder-card,
.info-card,
.update-card {
  padding: 12px 14px;
  border-radius: var(--radius-md);
  background: var(--bg-surface-subtle);
  border: 1px solid var(--border-hairline);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.reminder-row,
.perm-row,
.tray-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.tray-toggle-row {
  padding-top: 8px;
  border-top: 1px solid var(--border-subtle);
  cursor: pointer;
}

.reminder-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.sub-label {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-primary);
}

.sub-desc {
  font-size: 11.5px;
  color: var(--text-tertiary);
  line-height: 1.4;
}

.sub-desc code {
  font-family: var(--font-mono);
  background: var(--bg-muted);
  padding: 0 4px;
  border-radius: var(--radius-xs);
  color: var(--text-secondary);
}

.lead-input-wrap {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.lead-input {
  width: 74px;
  height: 28px;
  text-align: center;
  padding: 0 6px;
}

.unit-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.preset-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.preset-chip {
  height: 24px;
  padding: 0 10px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--border-hairline);
  background: var(--bg-surface);
  color: var(--text-secondary);
  font-size: 11.5px;
  font-weight: 500;
  transition: all 0.12s ease;
}

.preset-chip:hover:not(:disabled) {
  border-color: var(--border-strong);
  color: var(--text-primary);
}

.preset-chip.active {
  background: var(--accent-soft);
  border-color: var(--accent-border);
  color: var(--accent);
  font-weight: 600;
}

.perm-meta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.perm-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 1px 8px;
  border-radius: var(--radius-pill);
  background: var(--bg-muted);
  color: var(--text-secondary);
}

.perm-badge.perm-granted {
  background: var(--success-soft);
  border: 1px solid var(--success-border);
  color: var(--success);
}

.perm-badge.perm-denied {
  background: var(--danger-soft);
  border: 1px solid var(--danger-border);
  color: var(--danger);
}

.perm-badge.perm-prompt {
  background: var(--warning-soft);
  border: 1px solid var(--warning-border);
  color: var(--warning);
}

.perm-hint {
  margin: -2px 0 0;
  font-size: 11.5px;
  color: var(--warning);
  line-height: 1.45;
}

.tray-checkbox {
  width: 16px;
  height: 16px;
  accent-color: var(--accent);
  cursor: pointer;
  flex-shrink: 0;
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
