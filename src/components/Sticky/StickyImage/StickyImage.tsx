import { createResource, Show } from "solid-js";
import { getImageUrl } from "~/utils/imageStore";
import type { ImageRef } from "~/stores/stickyStore";

import "./sticky-image.scss";

type StickyImageProps = {
  image: ImageRef;
};

// Renders an image note's picture. The board holds only the id; the bytes live in
// IndexedDB and resolve to an object URL here (null = blob missing, e.g. a shared
// link whose archive wasn't imported).
export const StickyImage = (props: StickyImageProps) => {
  const [url] = createResource(() => props.image.id, getImageUrl);

  return (
    <div class="sticky-image">
      <Show when={url()} fallback={<div class="sticky-image-missing" />}>
        <img src={url() ?? ""} alt="" draggable={false} />
      </Show>
    </div>
  );
};
