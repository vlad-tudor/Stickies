# Stickies — Stationary Redesign · Developer Handoff

**Scope: DESIGN ONLY.** This package restyles the existing app. It introduces
no features, no new state, no logic refactors. Every change is CSS/SCSS plus
one global token import. Two clearly-marked items touch component logic and are
**explicitly out of scope** for this handoff (you own them) — see §5.

The target look: Muji-inspired stationary — warm paper, ruled board, ink type,
crisp paper edges, a curated sticky palette, and a re-tinted Crepe editor.

---

## 1. What's in this package

```
handoff/
├─ HANDOFF.md                         ← you are here
├─ reference/
│  └─ Sticky Board (visual reference).html   ← the approved look, standalone
└─ src/                               ← mirrors the repo; drop-in replacements
   ├─ styles/
   │  └─ tokens.css                   ← NEW FILE — the design system
   └─ components/
      ├─ Markdown/markdown.scss                       ← REPLACE (Crepe theme)
      ├─ BoardTabs/board-tabs.scss                    ← REPLACE
      ├─ Whiteboard/whiteboard.scss                   ← REPLACE (board surface)
      ├─ Whiteboard/WhiteboardActions/whiteboard-actions.scss ← REPLACE
      └─ Sticky/
         ├─ sticky.scss                               ← REPLACE
         ├─ StickyDragHandle/sticky-drag-handle.scss  ← REPLACE
         ├─ StickyColorInput/sticky-color-input.scss  ← REPLACE
         └─ StickyDeleteButton/sticky-delete-button.scss ← REPLACE
```

> **The reference HTML is a *visual* reference, not a pixel spec.** It was built
> as a mock and has a few rough edges. The authority for values is
> `tokens.css` + these SCSS files. When in doubt, trust the tokens.

---

## 2. The one thing to understand first: tokens

`src/styles/tokens.css` is the single source of truth — paper colors, ink,
rule lines, the six sticky tones, shadows, fonts, radii. Every SCSS file
references these custom properties; nothing is hardcoded.

**Install it once, globally, before component styles load.** Either:

```css
/* src/app.css — at the very top */
@import "./styles/tokens.css";
```

or import it in `app.tsx` above the component tree. That's the only wiring step.

---

## 3. Two theme systems — keep them separate

The app already has a per-sticky light/dark system. The redesign adds a global
chrome theme. **These are different things and both stay.**

| | Per-sticky ink contrast | Global chrome theme (NEW) |
|---|---|---|
| **Decides** | ink color on each note's own paper | board / tabs / toolbar / Crepe surfaces |
| **Driven by** | `isLightBackground()` → `.sticky.light` / `.sticky.dark` | `data-theme="dark"` on `<html>` |
| **Status** | unchanged (now pulls `--sticky-ink-*` tokens) | you add the toggle — see §5b |

`sticky.scss` keeps `.light`/`.dark`; they now set `color` **and**
`--crepe-color-on-background` from `--sticky-ink-dark` / `--sticky-ink-light`,
so a note's editor ink always matches its paper. No code change needed there.

---

## 4. Crepe restyle — the short version

**You do not redesign Crepe. You re-tint it.** Crepe styles its entire UI
(slash menu, bubble toolbar, link tooltip, placeholder, code blocks, tables,
images) from ~17 CSS variables it reads off `.milkdown`. The theme CSS you
import just sets those variables.

`markdown.scss` in this package overrides that same variable set with our
tokens — light and dark fall out automatically because the tokens flip.

Two small follow-ups in `src/components/Markdown/markdownEditor.ts`:

- **Keep** `import "@milkdown/crepe/theme/common/style.css";` (structure/layout).
- **Remove** `import "@milkdown/crepe/theme/nord.css";` — our variable block
  replaces it. (Leaving it is harmless; our block wins by load order. Removing
  is cleaner.)
- Keep `import "./markdown.scss";` last.

That's the whole Crepe redesign. Optional finer slash-menu/​toolbar tuning is in
a commented block at the bottom of `markdown.scss`.

---

## 5. OUT OF SCOPE — you own these (they touch logic, not just style)

The redesign *anticipates* both; the SCSS is ready for them. But implementing
them means editing `.tsx`, so they're yours.

**a) Constrained sticky / board palette**
- Today both are raw `<input type="color">`
  (`StickyColorInput.tsx`, and the bg picker in `WhiteboardActions.tsx`).
- Design intent: replace with a curated swatch row over the six `--s-*` tokens.
- `sticky-color-input.scss` already styles a `.sticky-swatch` row for this and
  keeps a fallback for the raw input until you switch.
- For the board, set `--board-bg` to the chosen paper token (see
  `whiteboard.scss`); the ruling overlay handles the rest.
- Default new-sticky color in `WhiteboardActions.tsx` (`onStickyCreate`) is
  currently `#e3d46f` — point it at a token tone (e.g. `--s-butter`).

**b) Global dark-mode toggle**
- Add a control that sets `document.documentElement.dataset.theme = "dark"`,
  persisted in `localStorage`, restored **before first paint** to avoid a flash.
- No CSS work needed — every token already has its dark value in `tokens.css`.

---

## 6. Apply order (suggested)

1. Add `tokens.css` + wire the global import (§2). Nothing changes visually yet.
2. Replace `whiteboard.scss` → ruled board surface appears.
3. Replace `board-tabs.scss` + `whiteboard-actions.scss` → chrome.
4. Replace `sticky.scss` + `sticky-drag-handle.scss` + the two control SCSS.
5. Replace `markdown.scss`, drop the `nord.css` import → Crepe re-tints.
6. Verify against `reference/`. Then tackle §5 at your own pace.

Each step is independent and safe to ship on its own.

---

## 7. Hard out-of-bounds (do not touch)

Stores / persistence (`stickyStore.ts`), markdown parsing, the drag math
(`useDrag`, `StickyDragHandle.tsx` logic), Crepe feature config, board
share/import/export. This is a paint job — the wiring stays exactly as is.
