<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import AppTopBar from '@/components/AppTopBar.vue';
import DayView from '@/components/DayView.vue';
import ExportModal from '@/components/ExportModal.vue';
import SettingsModal from '@/components/SettingsModal.vue';
import UndoToast from '@/components/UndoToast.vue';
import WeekView from '@/components/WeekView.vue';
import { useScheduleStore } from '@/stores/scheduleStore';

const store = useScheduleStore();
const showExportModal = ref(false);
const showSettingsModal = ref(false);

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

onMounted(() => {
  store.init();
  window.addEventListener('keydown', handleGlobalKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown);
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
