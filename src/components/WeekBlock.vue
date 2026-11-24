<script setup lang="ts">
import { computed } from 'vue';
import { ArrowUpRight, Download } from 'lucide-vue-next';
import DayMemosCell from '@/components/DayMemosCell.vue';
import DayTasksCell from '@/components/DayTasksCell.vue';
import WeeklyFocusPanel from '@/components/WeeklyFocusPanel.vue';
import { formatWeekRangeLabel, getWeekDates, todayStr } from '@/core/dateUtils';
import { useScheduleStore } from '@/stores/scheduleStore';

const props = defineProps<{
  weekStart: string;
}>();

const emit = defineEmits<{
  exportWeek: [weekStart: string];
}>();

const store = useScheduleStore();
const today = todayStr();

const days = computed(() => getWeekDates(props.weekStart, today));
const weekRangeLabel = computed(() => formatWeekRangeLabel(props.weekStart));
const isCurrentWeek = computed(() => days.value.some((d) => d.isToday));
const isActiveWeek = computed(() => store.activeWeekStart === props.weekStart);

const bundle = computed(() => store.weeksByStart[props.weekStart]);
const summaryText = computed(() => {
  const parts: string[] = [];
  const focuses = bundle.value?.focuses ?? [];
  if (focuses.length > 0) {
    parts.push(`重点 ${focuses.filter((f) => f.isDone).length}/${focuses.length}`);
  }
  const tasks = bundle.value?.tasks ?? [];
  if (tasks.length > 0) {
    parts.push(`任务 ${tasks.filter((t) => t.isDone).length}/${tasks.length}`);
  }
  return parts.join(' · ');
});

function handleExportClick(): void {
  store.setActiveWeek(props.weekStart);
  emit('exportWeek', props.weekStart);
}
</script>

<template>
  <section
    class="week-block"
    :class="{ 'is-current': isCurrentWeek, 'is-active': isActiveWeek }"
    :data-week-start="weekStart"
    @mousedown="store.setActiveWeek(weekStart)"
  >
    <header class="week-block-head">
      <div class="week-title-wrap">
        <span class="week-range tabular-nums">{{ weekRangeLabel }}</span>
        <span v-if="isCurrentWeek" class="current-week-badge">本周</span>
      </div>

      <div class="week-meta">
        <span v-if="summaryText" class="summary-text tabular-nums">{{ summaryText }}</span>
        <button
          type="button"
          class="icon-btn export-week-btn"
          title="导出本周 Markdown"
          @click.stop="handleExportClick()"
        >
          <Download :size="13" :stroke-width="1.8" />
        </button>
      </div>
    </header>

    <WeeklyFocusPanel :week-start="weekStart" />

    <div class="week-grid-scroll">
      <div class="week-calendar-grid" role="grid" :aria-label="`${weekRangeLabel} 日程`">
        <!-- Row 1: 对齐的周一至周日列头 -->
        <header
          v-for="(day, colIndex) in days"
          :key="`h-${day.date}`"
          class="day-header"
          :class="{
            'is-today': day.isToday,
            'is-weekend': day.isWeekend,
            'is-last-col': colIndex === 6,
          }"
          :style="{ gridColumn: colIndex + 1, gridRow: 1 }"
          title="查看日视图"
          @click="store.openDayView(day.date)"
        >
          <div class="day-heading">
            <span class="weekday-text">{{ day.weekdayLabel }}</span>
            <span class="day-number tabular-nums" :class="{ 'is-today-num': day.isToday }">
              {{ day.dayNum }}
            </span>
          </div>
          <span class="open-day-hint">
            <ArrowUpRight :size="12" :stroke-width="1.8" />
          </span>
        </header>

        <!-- Row 2: 每日待办区（底部分割线横跨七天完全对齐） -->
        <DayTasksCell
          v-for="(day, colIndex) in days"
          :key="`t-${day.date}`"
          :day="day"
          :col-index="colIndex"
        />

        <!-- Row 3: 每日备忘区（位于同一水平分割线之下） -->
        <DayMemosCell
          v-for="(day, colIndex) in days"
          :key="`m-${day.date}`"
          :day="day"
          :col-index="colIndex"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
.week-block {
  background: var(--bg-surface);
  border: 1px solid var(--border-hairline);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-xs);
  overflow: hidden;
  transition: border-color 0.16s ease, box-shadow 0.16s ease;
}

.week-block.is-current {
  border-color: #c4d7fe;
  box-shadow: 0 2px 14px rgba(37, 99, 235, 0.05);
}

.week-block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 14px;
  background: var(--bg-surface-subtle);
  border-bottom: 1px solid var(--border-subtle);
}

.week-block.is-current .week-block-head {
  background: #f6f9ff;
}

.week-title-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.week-range {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--text-primary);
}

.current-week-badge {
  font-size: 10.5px;
  font-weight: 600;
  padding: 1px 7px;
  border-radius: var(--radius-pill);
  background: var(--accent-soft);
  color: var(--accent);
}

.week-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.summary-text {
  font-size: 11.5px;
  color: var(--text-tertiary);
}

.export-week-btn {
  opacity: 0;
  transition: opacity 0.14s ease, background-color 0.12s ease, color 0.12s ease;
}

.week-block:hover .export-week-btn {
  opacity: 0.85;
}

.week-grid-scroll {
  width: 100%;
  overflow-x: auto;
}

.week-calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  grid-template-rows: auto minmax(80px, auto) minmax(48px, auto);
  min-width: 860px;
}

.day-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 9px;
  background: var(--bg-surface);
  border-right: 1px solid var(--border-subtle);
  border-bottom: 1px solid var(--border-subtle);
  cursor: pointer;
  user-select: none;
  transition: background-color 0.12s ease;
}

.day-header.is-last-col {
  border-right: none;
}

.day-header.is-weekend {
  background: var(--bg-weekend);
}

.day-header.is-today {
  background: #f6f9ff;
  box-shadow: inset 0 2px 0 var(--accent);
}

.day-header:hover {
  background: var(--bg-hover);
}

.day-header.is-today:hover {
  background: #ebf2ff;
}

.day-heading {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  white-space: nowrap;
}

.weekday-text {
  font-size: 11.5px;
  font-weight: 500;
  color: var(--text-tertiary);
  white-space: nowrap;
}

.day-header.is-today .weekday-text {
  color: var(--accent);
  font-weight: 600;
}

.day-number {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  line-height: 1;
}

.day-number.is-today-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 5px;
  border-radius: var(--radius-pill);
  background: var(--accent);
  color: #ffffff;
  font-size: 12px;
  font-weight: 600;
}

.open-day-hint {
  opacity: 0;
  color: var(--text-tertiary);
  display: inline-flex;
  align-items: center;
  transition: opacity 0.12s ease;
}

.day-header:hover .open-day-hint {
  opacity: 1;
}
</style>
