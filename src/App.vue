<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import AppTopBar from '@/components/AppTopBar.vue';
import DayView from '@/components/DayView.vue';
import ExportModal from '@/components/ExportModal.vue';
import SettingsModal from '@/components/SettingsModal.vue';
import UndoToast from '@/components/UndoToast.vue';
import WeekView from '@/components/WeekView.vue';
import { checkNotificationPermission } from '@/services/notificationHelper';
import { isTauriRuntime } from '@/services/scheduleApi';
import { useScheduleStore } from '@/stores/scheduleStore';
import { useUpdaterStore } from '@/stores/updaterStore';

interface DueMemoReminderPayload {
  memoId: string;
  memoDate: string;
  reminderTime: string;
  content: string;
  leadMinutes: number;
}

const store = useScheduleStore();
const updater = useUpdaterStore();
const showExportModal = ref(false);
const showSettingsModal = ref(false);
let updateCheckTimer: ReturnType<typeof setTimeout> | null = null;
const unlistenFns: Array<() => void> = [];

function handleGlobalKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    if (showExportModal.value) {
      showExportModal.value = false;
      return;
    }
    if (showSettingsModal.value) {
      showSettingsModal.value = false;
      return;
    }
  }

  const target = e.target as HTMLElement | null;
  const isTyping =
    target &&
    (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

  if (!isTyping && (e.metaKey || e.ctrlKey)) {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      store.stepPrev();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      store.stepNext();
    }
  }
}

onMounted(async () => {
  store.init();
  updater.ensureCurrentVersion();
  void checkNotificationPermission();

  updateCheckTimer = setTimeout(() => {
    updater.checkForUpdates({ silent: true });
  }, 3000);
  window.addEventListener('keydown', handleGlobalKeydown);

  if (isTauriRuntime()) {
    try {
      const { listen } = await import('@tauri-apps/api/event');
      const unlistenReminder = await listen<DueMemoReminderPayload>('memo-reminder', (event) => {
        const p = event.payload;
        if (!p) return;
        const prefix = p.leadMinutes === 0 ? `⏰ 备忘提醒 (${p.reminderTime})` : `⏰ 备忘即将开始 (${p.reminderTime})`;
        store.pushToast(`${prefix}：${p.content}`, 'info');
      });
      const unlistenUpdate = await listen('tray-check-update', () => {
        showSettingsModal.value = true;
        updater.checkForUpdates({ silent: false });
      });
      unlistenFns.push(unlistenReminder, unlistenUpdate);
    } catch {
      // ignore if event bridge is unavailable
    }
  }
});

onUnmounted(() => {
  if (updateCheckTimer) {
    clearTimeout(updateCheckTimer);
    updateCheckTimer = null;
  }
  window.removeEventListener('keydown', handleGlobalKeydown);
  while (unlistenFns.length > 0) {
    const unlisten = unlistenFns.pop();
    if (unlisten) unlisten();
  }
});
</script>

<template>
  <div class="app-shell">
    <AppTopBar
      @open-export="showExportModal = true"
      @open-settings="showSettingsModal = true"
    />

    <main class="app-main">
      <WeekView v-if="store.viewMode === 'week'" @open-export="showExportModal = true" />
      <DayView v-else />
    </main>

    <ExportModal v-if="showExportModal" @close="showExportModal = false" />
    <SettingsModal
      v-if="showSettingsModal"
      @close="showSettingsModal = false"
      @open-export="showExportModal = true"
    />

    <UndoToast />
  </div>
</template>

<style scoped>
.app-shell {
  height: 100vh;
  width: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-canvas);
  overflow: hidden;
}

.app-main {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
</style>
