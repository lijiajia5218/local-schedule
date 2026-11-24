<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  HelpCircle,
  Settings,
} from 'lucide-vue-next';
import { formatFullDayLabel, formatWeekRangeLabel, todayStr } from '@/core/dateUtils';
import { useScheduleStore } from '@/stores/scheduleStore';

const emit = defineEmits<{
  openExport: [];
  openSettings: [];
}>();

const store = useScheduleStore();
const showSyntaxGuide = ref(false);
const syntaxWrapRef = ref<HTMLElement | null>(null);

const isMac =
  typeof navigator !== 'undefined' &&
  /Mac|iPod|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
const modKey = isMac ? '⌘' : 'Ctrl+';

const prevTitle = computed(() =>
  store.viewMode === 'week' ? `上一周 (${modKey}←)` : `前一天 (${modKey}←)`
);
const nextTitle = computed(() =>
  store.viewMode === 'week' ? `下一周 (${modKey}→)` : `后一天 (${modKey}→)`
);

const periodLabel = computed(() => {
  if (store.viewMode === 'week') {
    return formatWeekRangeLabel(store.currentWeekStart);
  }
  return formatFullDayLabel(store.selectedDate);
});

const isAtToday = computed(() => {
  const today = todayStr();
  if (store.viewMode === 'week') {
    return store.weekDays.some((d) => d.date === today);
  }
  return store.selectedDate === today;
});

function handleOutsideClick(e: MouseEvent): void {
  if (!showSyntaxGuide.value) return;
  const target = e.target as Node | null;
  if (syntaxWrapRef.value && target && !syntaxWrapRef.value.contains(target)) {
    showSyntaxGuide.value = false;
  }
}

onMounted(() => {
  document.addEventListener('click', handleOutsideClick);
});

onUnmounted(() => {
  document.removeEventListener('click', handleOutsideClick);
});
</script>

<template>
  <header class="topbar">
    <div class="topbar-left">
      <div class="brand" @click="store.backToWeekView()" title="回到周视图">
        <span class="brand-icon">
          <CalendarDays :size="15" :stroke-width="2" />
        </span>
        <span class="brand-title">本地日程</span>
      </div>

      <div class="nav-group">
        <div class="nav-stepper">
          <button
            type="button"
            class="stepper-btn"
            :title="prevTitle"
            @click="store.stepPrev()"
          >
            <ChevronLeft :size="14" :stroke-width="2" />
          </button>
          <span class="period-label tabular-nums">{{ periodLabel }}</span>
          <button
            type="button"
            class="stepper-btn"
            :title="nextTitle"
            @click="store.stepNext()"
          >
            <ChevronRight :size="14" :stroke-width="2" />
          </button>
        </div>

        <button
          type="button"
          class="btn today-btn"
          :class="{ 'is-active': isAtToday }"
          @click="store.goToday()"
        >
          今天
        </button>
      </div>
    </div>

    <div class="topbar-right">
      <div class="segmented" role="tablist" aria-label="视图切换">
        <button
          type="button"
          role="tab"
          :aria-selected="store.viewMode === 'week'"
          class="seg-item"
          :class="{ active: store.viewMode === 'week' }"
          @click="store.setViewMode('week')"
        >
          周
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="store.viewMode === 'day'"
          class="seg-item"
          :class="{ active: store.viewMode === 'day' }"
          @click="store.setViewMode('day')"
        >
          日
        </button>
      </div>

      <div class="action-group">
        <div ref="syntaxWrapRef" class="syntax-wrap">
          <button
            type="button"
            class="icon-btn help-btn"
            :class="{ 'is-active': showSyntaxGuide }"
            title="输入语法"
            aria-label="输入语法"
            @click.stop="showSyntaxGuide = !showSyntaxGuide"
          >
            <HelpCircle :size="15" :stroke-width="1.8" />
          </button>

          <div v-if="showSyntaxGuide" class="syntax-popover" role="dialog" aria-label="输入语法">
            <div class="pop-item">
              <span class="pop-tag task">待办</span>
              <code>【】9-10｜周会</code>
              <span class="pop-extra">已完成用 【x】</span>
            </div>
            <div class="pop-item">
              <span class="pop-tag memo">备忘</span>
              <code>- 会议纪要</code>
              <span class="pop-extra">需以 - 开头</span>
            </div>
            <div class="pop-item">
              <span class="pop-tag focus">重点</span>
              <code>【】方案评审 @周五 - 进行中</code>
            </div>
          </div>
        </div>

        <button type="button" class="btn" @click="emit('openExport')">
          <Download :size="13.5" :stroke-width="1.8" />
          <span>导出</span>
        </button>
        <button type="button" class="btn" @click="emit('openSettings')">
          <Settings :size="13.5" :stroke-width="1.8" />
          <span>设置</span>
        </button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.topbar {
  position: relative;
  z-index: 30;
  height: var(--topbar-height);
  padding: 0 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: saturate(180%) blur(12px);
  -webkit-backdrop-filter: saturate(180%) blur(12px);
  border-bottom: 1px solid var(--border-hairline);
  flex-shrink: 0;
  user-select: none;
  white-space: nowrap;
}

.topbar-left,
.topbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 3px 4px 3px 0;
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.brand-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 7px;
  background: linear-gradient(180deg, #3b82f6 0%, #2563eb 100%);
  color: #ffffff;
  box-shadow: 0 1px 4px rgba(37, 99, 235, 0.28);
}

.brand-title {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.015em;
  color: var(--text-primary);
  white-space: nowrap;
}

.nav-group {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-left: 12px;
  border-left: 1px solid var(--border-hairline);
}

.nav-stepper {
  display: inline-flex;
  align-items: center;
  background: var(--bg-surface-subtle);
  border: 1px solid var(--border-hairline);
  border-radius: var(--radius-sm);
  height: 28px;
  padding: 0 2px;
}

.stepper-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--text-secondary);
  transition: background-color 0.12s ease, color 0.12s ease;
}

.stepper-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.period-label {
  padding: 0 8px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-primary);
  min-width: 132px;
  text-align: center;
  white-space: nowrap;
}

.today-btn.is-active {
  background: var(--accent-soft);
  border-color: var(--accent-border);
  color: var(--accent);
}

.segmented {
  display: inline-flex;
  align-items: center;
  padding: 2px;
  background: var(--bg-muted);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-hairline);
}

.seg-item {
  height: 22px;
  padding: 0 12px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  transition: all 0.14s ease;
}

.seg-item:hover:not(.active) {
  color: var(--text-primary);
}

.seg-item.active {
  background: var(--bg-surface);
  color: var(--text-primary);
  box-shadow: var(--shadow-xs);
  font-weight: 600;
}

.action-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.syntax-wrap {
  position: relative;
}

.help-btn {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
}

.help-btn.is-active {
  background: var(--accent-soft);
  color: var(--accent);
}

.syntax-popover {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 310px;
  padding: 10px 12px;
  background: var(--bg-surface);
  border: 1px solid var(--border-hairline);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  gap: 8px;
  white-space: normal;
  z-index: 50;
}

.pop-item {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 12px;
}

.pop-tag {
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: var(--radius-xs);
  font-size: 11px;
  font-weight: 600;
}

.pop-tag.task {
  background: var(--accent-soft);
  color: var(--accent);
}

.pop-tag.memo {
  background: var(--bg-muted);
  color: var(--text-secondary);
}

.pop-tag.focus {
  background: var(--warning-soft);
  color: var(--warning);
}

.pop-item code {
  font-family: var(--font-mono);
  font-size: 11.5px;
  background: var(--bg-surface-subtle);
  border: 1px solid var(--border-subtle);
  padding: 1px 5px;
  border-radius: var(--radius-xs);
  color: var(--text-primary);
}

.pop-extra {
  font-size: 11px;
  color: var(--text-tertiary);
}
</style>
