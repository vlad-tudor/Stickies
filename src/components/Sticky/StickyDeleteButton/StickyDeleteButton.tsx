import "./sticky-delete-button.scss";

type StickyDeleteButtonProps = {
  deleteSticky: () => void;
};

export const StickyDeleteButton = (props: StickyDeleteButtonProps) => {
  return (
    <div
      class="sticky-delete-button"
      onClick={(e) => {
        e.stopPropagation(); // don't bubble to the sticky's edit-on-click
        props.deleteSticky();
      }}
    >
      ✕
    </div>
  );
};
