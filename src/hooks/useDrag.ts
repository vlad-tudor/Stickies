type UseDragOptions = {
  cursor?: string;
  onStart?: (e: PointerEvent) => void;
  onMove: (e: PointerEvent) => void;
  onEnd?: (e: PointerEvent) => void;
};

type PointerDragHandlers = {
  onPointerDown: (e: PointerEvent) => void;
};

export function useDrag(options: UseDragOptions): PointerDragHandlers {
  return {
    onPointerDown: (e: PointerEvent) => {
      e.preventDefault();
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);

      let cursorOverride: HTMLStyleElement | null = null;
      if (options.cursor) {
        cursorOverride = document.createElement("style");
        cursorOverride.textContent = `* { cursor: ${options.cursor} !important; }`;
        document.head.appendChild(cursorOverride);
      }

      options.onStart?.(e);

      const onPointerMove = (e: PointerEvent) => {
        options.onMove(e);
      };

      const onPointerUp = (e: PointerEvent) => {
        target.releasePointerCapture(e.pointerId);
        target.removeEventListener("pointermove", onPointerMove);
        target.removeEventListener("pointerup", onPointerUp);
        cursorOverride?.remove();
        options.onEnd?.(e);
      };

      target.addEventListener("pointermove", onPointerMove);
      target.addEventListener("pointerup", onPointerUp);
    },
  };
}
