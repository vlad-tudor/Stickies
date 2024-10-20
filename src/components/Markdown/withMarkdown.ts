import { CrepeSessionOrchestrator } from "./withCrepe";

import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/nord.css";

import "./markdown.scss";

export type MarkdownProps = {
  rootElementRef: HTMLDivElement;
  previousMarkdown?: string;
  onBeforeDestroy?: () => void;
  onMarkdownUpdated: (markdown: string) => void;
};

const orchestrator = new CrepeSessionOrchestrator();

export const loadMarkdownContent = async (props: MarkdownProps) => {
  orchestrator.createContentFillingSession(props);
  // orchestrator.createEditorSession(props);
};

export const startMarkdownEditor = async (props: MarkdownProps) => {
  orchestrator.createEditorSession(props);
};
