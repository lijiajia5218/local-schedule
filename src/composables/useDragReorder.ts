import { onUnmounted, ref } from 'vue';

export interface DropIndicator {
  id: string;
  position: 'before' | 'after';
}

export interface UseDragReorderOptions {
  getItemIds: () => string[];
  getRowElements: () => HTMLElement[];
  onReorder: (orderedIds: string[]) => void | Promise<void>;
  isDisabled?: () => boolean;
}

const DRAG_THRESHOLD_PX = 5;

function reorderIdList(
  ids: string[],
  sourceId: string,
  targetId: string,
  position: 'before' | 'after'
): string[] | null {
  const fromIdx = ids.indexOf(sourceId);
  const toIdx = ids.indexOf(targetId);
  if (fromIdx === -1 || toIdx === -1) return null;

  const remaining = ids.filter((id) => id !== sourceId);
  const targetRemainingIdx = remaining.indexOf(targetId);
  if (targetRemainingIdx === -1) return null;

  const insertIdx = position === 'before' ? targetRemainingIdx : targetRemainingIdx + 1;
  remaining.splice(insertIdx, 0, sourceId);

  const unchanged = remaining.every((id, i) => id === ids[i]);
  return unchanged ? null : remaining;
}

/**
 * Cross-platform pointer-based drag-and-drop list reordering composable.
 * Uses a 5px movement threshold so single clicks and double-click inline edits never conflict.
 */
export function useDragReorder(options: UseDragReorderOptions) {
  const draggingId = ref<string | null>(null);
  const dropIndicator = ref<DropIndicator | null>(null);

  let activeCandidateId: string | null = null;
  let startX = 0;
  let startY = 0;
  let isDragging = false;

  function computeDropTarget(clientY: number): DropIndicator | null {
    const rows = options.getRowElements().filter((el) => el.dataset.dragId);
    if (rows.length === 0) return null;

    for (const el of rows) {
      const rect = el.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if (clientY <= midY) {
        const id = el.dataset.dragId!;
        return { id, position: 'before' };
      }
    }
    const lastId = rows[rows.length - 1].dataset.dragId!;
    return { id: lastId, position: 'after' };
  }

  function cleanup(): void {
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
    window.removeEventListener('pointercancel', handlePointerCancel);
    if (typeof document !== 'undefined') {
      document.body.style.userSelect = '';
    }
    activeCandidateId = null;
    isDragging = false;
    draggingId.value = null;
    dropIndicator.value = null;
  }

  function handlePointerMove(e: PointerEvent): void {
    if (!activeCandidateId) return;

    if (!isDragging) {
      const dist = Math.hypot(e.clientX - startX, e.clientY - startY);
      if (dist < DRAG_THRESHOLD_PX) return;
      isDragging = true;
      draggingId.value = activeCandidateId;
      if (typeof document !== 'undefined') {
        document.body.style.userSelect = 'none';
      }
    }

    dropIndicator.value = computeDropTarget(e.clientY);
  }

  function handlePointerUp(): void {
    const sourceId = draggingId.value;
    const target = dropIndicator.value;
    const wasDragging = isDragging;
    cleanup();

    if (!wasDragging || !sourceId || !target) return;
    if (sourceId === target.id) return;

    const currentIds = options.getItemIds();
    const nextIds = reorderIdList(currentIds, sourceId, target.id, target.position);
    if (nextIds) {
      void options.onReorder(nextIds);
    }
  }

  function handlePointerCancel(): void {
    cleanup();
  }

  function onRowPointerDown(itemId: string, event: PointerEvent): void {
    if (event.button !== 0) return;
    if (options.isDisabled?.()) return;

    const target = event.target as HTMLElement | null;
    if (target?.closest('button, input, textarea, a, [data-no-drag]')) {
      return;
    }

    if (options.getItemIds().length < 2) return;

    activeCandidateId = itemId;
    startX = event.clientX;
    startY = event.clientY;
    isDragging = false;

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerCancel);
  }

  onUnmounted(() => {
    cleanup();
  });

  return {
    draggingId,
    dropIndicator,
    onRowPointerDown,
  };
}
