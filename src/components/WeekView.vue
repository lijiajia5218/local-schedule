<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue';
import { ChevronDown } from 'lucide-vue-next';
import WeekBlock from '@/components/WeekBlock.vue';
import { useScheduleStore } from '@/stores/scheduleStore';

const emit = defineEmits<{
  openExport: [];
}>();

const store = useScheduleStore();
const scrollContainerRef = ref<HTMLElement | null>(null);

async function scrollWeekIntoView(weekStart: string, instant = false): Promise<void> {
  await nextTick();
  const container = scrollContainerRef.value;
  if (!container) return;
  const el = container.querySelector<HTMLElement>(`[data-week-start="${weekStart}"]`);
  if (el) {
    el.scrollIntoView({ behavior: instant ? 'auto' : 'smooth', block: 'start' });
  }
}

onMounted(() => {
  if (store.scrollToWeekSignal) {
    scrollWeekIntoView(store.scrollToWeekSignal.weekStart, true);
  }
});

watch(
  () => store.scrollToWeekSignal,
  (signal) => {
    if (signal) {
      scrollWeekIntoView(signal.weekStart, false);
    }
  }
);
</script>

<template>
  <div ref="scrollContainerRef" class="week-stream-scroll">
    <div class="week-stream">
      <WeekBlock
        v-for="weekStart in store.visibleWeekStarts"
        :key="weekStart"
        :week-start="weekStart"
        @export-week="emit('openExport')"
      />

      <div class="stream-edge">
        <button
          type="button"
          class="edge-btn"
          :disabled="store.loading"
          @click="store.loadEarlierWeeks(2)"
        >
          <ChevronDown :size="13" />
          <span>加载更早 2 周</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.week-stream-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 20px 36px;
}

.week-stream {
  max-width: 1400px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.stream-edge {
  display: flex;
  justify-content: center;
  padding-top: 2px;
}

.edge-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 14px;
  border: 1px solid transparent;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--text-tertiary);
  font-size: 11.5px;
  font-weight: 500;
  transition: color 0.14s ease, background-color 0.14s ease, border-color 0.14s ease;
}

.edge-btn:hover:not(:disabled) {
  color: var(--text-primary);
  background: var(--bg-surface);
  border-color: var(--border-hairline);
  box-shadow: var(--shadow-xs);
}

@media (max-width: 960px) {
  .week-stream-scroll {
    padding: 12px 14px 28px;
  }
}
</style>
