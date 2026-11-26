<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import {
  ArrowUpCircle,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Download,
  HelpCircle,
  Settings,
} from 'lucide-vue-next';
import { formatFullDayLabel, formatWeekRangeLabel, todayStr } from '@/core/dateUtils';
import { useScheduleStore } from '@/stores/scheduleStore';
import { useUpdaterStore } from '@/stores/updaterStore';

const emit = defineEmits<{
  openExport: [];
  openSettings: [];
}>();

const store = useScheduleStore();
const updater = useUpdaterStore();
const showSyntaxGuide = ref(false);
const syntaxWrapRef = ref<HTMLElement | null>(null);

const isMac =
  typeof navigator !== 'undefined' &&
  /Mac|iPod|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
const modKey = isMac ? '⌘' : 'Ctrl+';

const prevTitle = computed(() =>
  store.viewMode === 'week' ? `上一周 (${modKey}←)` : `前一天 (${modKey}←)`
);
const nextTitle = computed(() => {
  if (!store.canStepNext) {
    return '最多可查看下周 1 周';
  }
  return store.viewMode === 'week' ? `下一周 (${modKey}→)` : `后一天 (${modKey}→)`;
});

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
        <span class="brand-logo" aria-hidden="true">
          <svg viewBox="0 0 28 28" width="26" height="26" fill="none">
            <rect
              x="2.5"
              y="4"
              width="23"
              height="21.5"
              rx="6"
              fill="#FCFBF8"
              stroke="rgba(31,36,43,0.14)"
              stroke-width="1"
            />
            <path
              d="M2.5 10C2.5 6.68629 5.18629 4 8.5 4H19.5C22.8137 4 25.5 6.68629 25.5 10V10.5H2.5V10Z"
              fill="url(#ls-brand-hdr)"
            />
            <rect x="8" y="2.2" width="2.4" height="4.4" rx="1.2" fill="#D5D9DF" stroke="#8C95A2" stroke-width="0.6" />
            <rect x="17.6" y="2.2" width="2.4" height="4.4" rx="1.2" fill="#D5D9DF" stroke="#8C95A2" stroke-width="0.6" />
            <rect x="6.2" y="13.2" width="4.4" height="4" rx="1.1" fill="#ECE9E2" />
            <rect x="11.8" y="13.2" width="4.4" height="4" rx="1.1" fill="#ECE9E2" />
            <rect x="17.4" y="13.2" width="4.4" height="4" rx="1.1" fill="#ECE9E2" />
            <rect x="6.2" y="18.6" width="4.4" height="4" rx="1.1" fill="#ECE9E2" />
            <rect x="11.8" y="18.6" width="4.4" height="4" rx="1.1" fill="#E0B06A" />
            <rect x="17.4" y="18.6" width="4.4" height="4" rx="1.1" fill="#4F8A6E" />
            <path
              d="M18.6 20.6L19.4 21.4L20.8 19.9"
              stroke="#FFFFFF"
              stroke-width="1.1"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <defs>
              <linearGradient id="ls-brand-hdr" x1="14" y1="4" x2="14" y2="10.5" gradientUnits="userSpaceOnUse">
                <stop stop-color="#5E7A96" />
                <stop offset="1" stop-color="#4B637D" />
              </linearGradient>
            </defs>
          </svg>
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
            :disabled="!store.canStepNext"
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
      <button
        v-if="store.viewMode === 'week'"
        type="button"
        class="btn weekend-toggle-btn"
        :class="{ 'is-collapsed': store.hideWeekends }"
        :title="store.hideWeekends ? '当前隐藏周末，点击显示 7 天' : '当前显示 7 天，点击隐藏周末'"
        @click="store.toggleHideWeekends()"
      >
        <Columns3 :size="13.5" :stroke-width="1.8" />
        <span>{{ store.hideWeekends ? '5天' : '7天' }}</span>
      </button>

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
        <button
          v-if="updater.status === 'available' && updater.availableVersion"
          type="button"
          class="update-pill"
          title="发现新版本，点击查看并更新"
          @click="emit('openSettings')"
        >
          <ArrowUpCircle :size="13" :stroke-width="2" />
          <span>v{{ updater.availableVersion }}</span>
        </button>

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
              <span class="pop-extra">支持 10.30-11.30 / 【x】</span>
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
            <div class="pop-tip">双击条目编辑 · 拖拽调整顺序 · 清空回车删除</div>
          </div>
        </div>

        <button type="button" class="btn" @click="emit('openExport')">
          <Download :size="13.5" :stroke-width="1.8" />
          <span>导出</span>
        </button>
        <button type="button" class="btn settings-btn" @click="emit('openSettings')">
          <Settings :size="13.5" :stroke-width="1.8" />
          <span>设置</span>
          <span v-if="updater.status === 'available'" class="settings-dot" aria-hidden="true" />
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
  gap: 12px;
  background: rgba(250, 249, 246, 0.86);
  backdrop-filter: saturate(180%) blur(14px);
  -webkit-backdrop-filter: saturate(180%) blur(14px);
  border-bottom: 1px solid var(--border-hairline);
  flex-shrink: 0;
  user-select: none;
  white-space: nowrap;
}

.topbar-left,
.topbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 3px 6px 3px 2px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background-color 0.14s ease;
}

.brand:hover {
  background: rgba(31, 36, 43, 0.04);
}

.brand-logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  filter: drop-shadow(0 1px 2px rgba(28, 32, 38, 0.1));
}

.brand-title {
  font-size: 14px;
  font-weight: 650;
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
  background: var(--bg-surface);
  border: 1px solid var(--border-hairline);
  border-radius: var(--radius-sm);
  box-shadow: 0 1px 1px rgba(28, 32, 38, 0.02);
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

.stepper-btn:hover:not(:disabled) {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.stepper-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.period-label {
  padding: 0 8px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-primary);
  min-width: 126px;
  text-align: center;
  white-space: nowrap;
}

.today-btn.is-active,
.weekend-toggle-btn.is-collapsed {
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
  border: 1px solid var(--border-subtle);
}

.seg-item {
  height: 22px;
  padding: 0 11px;
  border: none;
  border-radius: 5px;
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

.update-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 0 9px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--accent-border);
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.14s ease;
}

.update-pill:hover {
  background: #e1eaf4;
}

.settings-btn {
  position: relative;
}

.settings-dot {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--warning);
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
  width: 318px;
  padding: 12px 14px;
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
  padding: 1px 7px;
  border-radius: var(--radius-xs);
  font-size: 11px;
  font-weight: 600;
}

.pop-tag.task {
  background: var(--accent-soft);
  color: var(--accent);
  border: 1px solid var(--accent-border);
}

.pop-tag.memo {
  background: var(--bg-muted);
  color: var(--text-secondary);
}

.pop-tag.focus {
  background: var(--warning-soft);
  color: var(--warning);
  border: 1px solid var(--warning-border);
}

.pop-item code {
  font-family: var(--font-mono);
  font-size: 11.5px;
  background: var(--bg-surface-subtle);
  border: 1px solid var(--border-subtle);
  padding: 1px 6px;
  border-radius: var(--radius-xs);
  color: var(--text-primary);
}

.pop-extra {
  font-size: 11px;
  color: var(--text-tertiary);
}

.pop-tip {
  padding-top: 6px;
  border-top: 1px solid var(--border-subtle);
  font-size: 11px;
  color: var(--text-tertiary);
}

@media (max-width: 960px) {
  .topbar {
    padding: 0 14px;
    gap: 8px;
  }

  .topbar-left,
  .topbar-right {
    gap: 8px;
  }

  .nav-group {
    padding-left: 8px;
    gap: 6px;
  }

  .period-label {
    min-width: 114px;
    padding: 0 6px;
  }
}
</style>
