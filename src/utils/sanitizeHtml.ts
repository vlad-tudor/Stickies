import DOMPurify from "dompurify";

// Note bodies are Tiptap-generated HTML, but in a live session they arrive
// from peers over Yjs — treat them as untrusted where they're rendered raw.
export const sanitizeHtml = (html: string): string => DOMPurify.sanitize(html);
