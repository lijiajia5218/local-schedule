<script setup lang="ts">
import { computed } from 'vue';
import { ArrowUpRight, ChevronLeft, Download, PanelRightClose } from 'lucide-vue-next';
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
const showWeekend = computed(() => store.isWeekWeekendExpanded(props.weekStart));
const visibleDays = computed(() => (showWeekend.value ? days.value : days.value.slice(0, 5)));
const weekendCount = computed(() => store.weekendItemCount(props.weekStart));
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
      <div
        class="week-calendar-grid"
        :class="{ 'is-weekend-collapsed': !showWeekend }"
        role="grid"
        :aria-label="`${weekRangeLabel} 日程`"
      >
        <!-- Row 1: 对齐的列头（5 工作日或 7 天） -->
        <header
          v-for="(day, colIndex) in visibleDays"
          :key="`h-${day.date}`"
          class="day-header"
          :class="{
            'is-today': day.isToday,
            'is-weekend': day.isWeekend,
            'is-last-col': showWeekend && colIndex === 6,
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
          <div class="day-header-actions">
            <button
              v-if="showWeekend && store.hideWeekends && colIndex === 6"
              type="button"
              class="collapse-weekend-btn"
              title="收起本周周末"
              @click.stop="store.toggleWeekWeekend(weekStart)"
            >
              <PanelRightClose :size="12" :stroke-width="1.8" />
            </button>
            <span class="open-day-hint">
              <ArrowUpRight :size="12" :stroke-width="1.8" />
            </span>
          </div>
        </header>

        <!-- Row 2: 每日待办区（底部分割线横跨可见列完全对齐） -->
        <DayTasksCell
          v-for="(day, colIndex) in visibleDays"
          :key="`t-${day.date}`"
          :day="day"
          :col-index="colIndex"
          :is-last-col="showWeekend && colIndex === 6"
        />

        <!-- Row 3: 每日备忘区（位于同一水平分割线之下） -->
        <DayMemosCell
          v-for="(day, colIndex) in visibleDays"
          :key="`m-${day.date}`"
          :day="day"
          :col-index="colIndex"
          :is-last-col="showWeekend && colIndex === 6"
        />

        <!-- 折叠态右侧周末窄提示条（跨越全部 3 行） -->
        <button
          v-if="!showWeekend"
          type="button"
          class="weekend-rail"
          :class="{ 'has-items': weekendCount > 0 }"
          :style="{ gridColumn: 6, gridRow: '1 / 4' }"
          :title="weekendCount > 0 ? `展开周末（${weekendCount} 条记录）` : '展开本周周末'"
          @click.stop="store.toggleWeekWeekend(weekStart)"
        >
          <ChevronLeft :size="12" :stroke-width="1.9" class="rail-chevron" />
          <span class="rail-label">周末</span>
          <span v-if="weekendCount > 0" class="rail-badge tabular-nums">{{ weekendCount }}</span>
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.week-block {
  scroll-margin-top: 14px;
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

.week-calendar-grid.is-weekend-collapsed {
  grid-template-columns: repeat(5, minmax(0, 1fr)) 30px;
  min-width: 640px;
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

.day-header-actions {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.collapse-weekend-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--text-tertiary);
  transition: background-color 0.12s ease, color 0.12s ease;
}

.collapse-weekend-btn:hover {
  background: rgba(15, 23, 42, 0.08);
  color: var(--text-primary);
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

.weekend-rail {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 30px;
  padding: 8px 2px;
  border: none;
  background: var(--bg-weekend);
  color: var(--text-tertiary);
  cursor: pointer;
  user-select: none;
  transition: background-color 0.14s ease, color 0.14s ease;
}

.weekend-rail:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.weekend-rail.has-items {
  background: #f2f6ff;
  color: var(--accent);
}

.weekend-rail.has-items:hover {
  background: #e6eeff;
}

.rail-chevron {
  opacity: 0.7;
  flex-shrink: 0;
}

.rail-label {
  writing-mode: vertical-rl;
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: 0.1em;
}

.rail-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: var(--radius-pill);
  background: var(--accent);
  color: #ffffff;
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
}
</style>
