type UseDragOptions = {
  cursor?: string;
  threshold?: number;        // px of movement before it counts as a drag (default 3)
  preventDefault?: boolean;  // default true
  onStart?: (e: PointerEvent) => void;
  onMove: (e: PointerEvent) => void;
  onEnd?: (e: PointerEvent) => void;
  onTap?: (e: PointerEvent) => void; // released within threshold (no drag)
};

type PointerDragHandlers = {
  onPointerDown: (e: PointerEvent) => void;
};

export function useDrag(options: UseDragOptions): PointerDragHandlers {
  return {
    onPointerDown: (e: PointerEvent) => {
      const target = e.currentTarget as HTMLElement;
      if (options.preventDefault !== false) e.preventDefault();
      target.setPointerCapture(e.pointerId);

      const startX = e.clientX;
      const startY = e.clientY;
      const threshold = options.threshold ?? 3;
      let dragging = false;
      let cursorOverride: HTMLStyleElement | null = null;

      const onPointerMove = (ev: PointerEvent) => {
        if (!dragging) {
          if (
            Math.abs(ev.clientX - startX) < threshold &&
            Math.abs(ev.clientY - startY) < threshold
          ) {
            return;
          }
          dragging = true;
          if (options.cursor) {
            cursorOverride = document.createElement("style");
            cursorOverride.textContent = `* { cursor: ${options.cursor} !important; }`;
            document.head.appendChild(cursorOverride);
          }
          options.onStart?.(ev);
        }
        options.onMove(ev);
      };

      const onPointerUp = (ev: PointerEvent) => {
        target.releasePointerCapture(ev.pointerId);
        target.removeEventListener("pointermove", onPointerMove);
        target.removeEventListener("pointerup", onPointerUp);
        cursorOverride?.remove();
        if (dragging) options.onEnd?.(ev);
        else options.onTap?.(ev);
      };

      target.addEventListener("pointermove", onPointerMove);
      target.addEventListener("pointerup", onPointerUp);
    },
  };
}
