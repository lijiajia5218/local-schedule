<script setup lang="ts">
import { RotateCcw } from 'lucide-vue-next';
import { useScheduleStore } from '@/stores/scheduleStore';

const store = useScheduleStore();
</script>

<template>
  <div class="toast-stack" aria-live="polite">
    <div
      v-for="item in store.pendingDeletes"
      :key="item.pendingId"
      class="toast-item is-undo"
    >
      <span class="toast-msg">已删除「{{ item.label }}」</span>
      <button type="button" class="undo-btn" @click="store.undoDelete(item.pendingId)">
        <RotateCcw :size="12" />
        <span>撤销</span>
      </button>
      <span class="undo-bar" />
    </div>

    <div
      v-for="notice in store.toasts"
      :key="notice.id"
      class="toast-item"
      :class="`tone-${notice.tone}`"
    >
      <span class="toast-msg">{{ notice.message }}</span>
    </div>
  </div>
</template>

<style scoped>
.toast-stack {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 60;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  pointer-events: none;
}

.toast-item {
  position: relative;
  overflow: hidden;
  pointer-events: auto;
  display: inline-flex;
  align-items: center;
  gap: 12px;
  min-width: 220px;
  max-width: 460px;
  padding: 9px 14px;
  border-radius: var(--radius-md);
  background: #23272f;
  color: #f6f5f1;
  font-size: 12.5px;
  box-shadow: var(--shadow-md);
}

.toast-item.tone-error {
  background: var(--danger);
}

.toast-msg {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.undo-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 9px;
  border: none;
  border-radius: var(--radius-xs);
  background: rgba(255, 255, 255, 0.14);
  color: #cbd8e6;
  font-size: 12px;
  font-weight: 600;
  transition: background-color 0.12s ease, color 0.12s ease;
}

.undo-btn:hover {
  background: rgba(255, 255, 255, 0.24);
  color: #ffffff;
}

.undo-bar {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 2.5px;
  width: 100%;
  background: #e0b06a;
  transform-origin: left center;
  animation: countdown 5s linear forwards;
}

@keyframes countdown {
  from {
    transform: scaleX(1);
  }
  to {
    transform: scaleX(0);
  }
}
</style>
