import "./sticky-delete-button.scss";

type StickyDeleteButtonProps = {
  deleteSticky: () => void;
};

export const StickyDeleteButton = (props: StickyDeleteButtonProps) => {
  return (
    <div class="sticky-delete-button" onClick={props.deleteSticky}>
      ✖️
    </div>
  );
};
