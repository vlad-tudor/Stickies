type UseDragOptions = {
  onStart?: (e: DragEvent) => void;
  onMove: (e: DragEvent) => void;
  onEnd?: (e: DragEvent) => void;
};

type DragHandlers = {
  setInvisibleEl: (el: HTMLDivElement) => void;
  onDragStart: (e: DragEvent) => void;
  onDrag: (e: DragEvent) => void;
  onDragEnd: (e: DragEvent) => void;
};

export function useDrag(options: UseDragOptions): DragHandlers {
  let invisibleEl: HTMLDivElement;

  return {
    setInvisibleEl: (el: HTMLDivElement) => { invisibleEl = el; },
    onDragStart: (e: DragEvent) => {
      e.dataTransfer?.setDragImage(invisibleEl, 0, 0);
      options.onStart?.(e);
    },
    onDrag: (e: DragEvent) => {
      if (e.clientX === 0 && e.clientY === 0) return;
      options.onMove(e);
    },
    onDragEnd: (e: DragEvent) => {
      options.onEnd?.(e);
    },
  };
}
