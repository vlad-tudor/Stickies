import { type JSX } from "solid-js";

/**
 * The one sanctioned innerHTML sink for lucide-static's build-time SVG strings.
 * display:contents keeps the wrapper out of layout so existing `button svg`
 * sizing rules apply to the svg directly.
 */
export const Icon = (props: { svg: string }): JSX.Element => (
  // eslint-disable-next-line solid/no-innerhtml -- trusted build-time lucide SVG
  <span style={{ display: "contents" }} aria-hidden="true" innerHTML={props.svg} />
);
