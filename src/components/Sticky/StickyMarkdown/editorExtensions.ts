import { generateHTML, type Extensions } from "@tiptap/core";
import { yXmlFragmentToProsemirrorJSON } from "y-prosemirror";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import type * as Y from "yjs";
import type { Awareness } from "y-protocols/awareness";
import { localIdentity } from "~/utils/identity";
import { toneVar } from "~/utils/tones";

// The marks/nodes shared by the editable TiptapEditor and the read-only fragment
// view, so a note's body renders identically whether you're editing it or
// watching a peer edit it. Passing `fragment` opts into the collaborative binding
// (history yields to yjs undo); passing `awareness` adds in-body peer carets.
export const stickyBodyExtensions = (opts: {
  fragment?: Y.XmlFragment;
  awareness?: Awareness;
}): Extensions => {
  const extensions: Extensions = [
    StarterKit.configure(opts.fragment ? { history: false } : {}),
    Underline,
    Link.configure({ openOnClick: false }),
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
  ];
  if (opts.fragment) {
    extensions.push(Collaboration.configure({ fragment: opts.fragment }));
    if (opts.awareness) {
      const identity = localIdentity();
      extensions.push(
        CollaborationCursor.configure({
          provider: { awareness: opts.awareness },
          user: { name: identity.name, color: toneVar(identity.color) },
        }),
      );
    }
  }
  return extensions;
};

// Schema-only extension set for serializing outside any editor — generateHTML
// reads marks/nodes; plugins never instantiate.
const schemaExtensions = stickyBodyExtensions({});

// A note's body fragment rendered to HTML: the same converged content an
// editor bound to it would show, without mounting one.
export const fragmentToHtml = (fragment: Y.XmlFragment): string =>
  generateHTML(yXmlFragmentToProsemirrorJSON(fragment), schemaExtensions);
