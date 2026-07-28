import type { MouseEvent as ReactMouseEvent, TouchEvent as ReactTouchEvent } from 'react';

type Point = { x: number; y: number };

type LongPressHandlers = {
  onContextMenu: (event: ReactMouseEvent) => void;
  onTouchStart: (event: ReactTouchEvent) => void;
  onTouchMove: (event: ReactTouchEvent) => void;
  onTouchEnd: () => void;
  onTouchCancel: () => void;
};

/**
 * Desktop: native context menu.
 * Mobile: ~480ms long-press without blocking scroll (cancels on move > 10px).
 */
export function createLongPressMenu(
  open: (point: Point) => void,
  options?: { delayMs?: number; moveCancelPx?: number },
): LongPressHandlers {
  const delayMs = options?.delayMs ?? 480;
  const moveCancelPx = options?.moveCancelPx ?? 10;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let start: Point | null = null;

  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    start = null;
  };

  return {
    onContextMenu: (event) => {
      event.preventDefault();
      event.stopPropagation();
      open({ x: event.clientX, y: event.clientY });
    },
    onTouchStart: (event) => {
      if (event.touches.length !== 1) {
        clear();
        return;
      }
      const touch = event.touches[0];
      start = { x: touch.clientX, y: touch.clientY };
      timer = setTimeout(() => {
        if (!start) return;
        open({ ...start });
        clear();
      }, delayMs);
    },
    onTouchMove: (event) => {
      if (!start || !timer || event.touches.length !== 1) return;
      const touch = event.touches[0];
      const dx = Math.abs(touch.clientX - start.x);
      const dy = Math.abs(touch.clientY - start.y);
      if (dx > moveCancelPx || dy > moveCancelPx) clear();
    },
    onTouchEnd: clear,
    onTouchCancel: clear,
  };
}

export function clampMenuPosition(
  x: number,
  y: number,
  width = 220,
  height = 220,
): Point {
  const pad = 8;
  const maxX = Math.max(pad, window.innerWidth - width - pad);
  const maxY = Math.max(pad, window.innerHeight - height - pad);
  return {
    x: Math.min(Math.max(pad, x), maxX),
    y: Math.min(Math.max(pad, y), maxY),
  };
}
