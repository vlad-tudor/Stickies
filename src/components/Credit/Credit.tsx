import { ArrowUpRight } from "lucide-static";
import { PORTFOLIO_URL } from "~/config";
import "./credit.scss";

// Single app-wide credit mark, pinned bottom-right (outside the per-pane chrome so
// it shows once, not once per split pane). Version sits before the "by Tudor-Vlad"
// link back to the root portfolio site (see PORTFOLIO_URL in ~/config).
export const Credit = () => {
  return (
    <div class="app-credit">
      <span class="app-credit__version">v{__APP_VERSION__}</span>
      <span class="app-credit__sep" aria-hidden="true">·</span>
      <a
        class="app-credit__link"
        href={PORTFOLIO_URL}
        target="_blank"
        rel="noopener noreferrer"
      >
        by Tudor-Vlad
        <span class="app-credit__arrow" aria-hidden="true" innerHTML={ArrowUpRight} />
      </a>
    </div>
  );
};
