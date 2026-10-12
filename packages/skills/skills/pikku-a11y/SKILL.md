---
name: pikku-a11y
description: >-
  Accessibility rules (WCAG 2.2) for shadcn/Tailwind app UI: labeled inputs, real buttons/links, keyboard and focus, contrast and not-color-alone, modals, reduced motion.
  TRIGGER when: building forms or any interactive UI, icon-only buttons, modals/drawers, tables/lists with actions, keyboard/focus work, or the user mentions accessibility / screen readers / WCAG.
  DO NOT TRIGGER when: working on backend functions, database, or deployment with no UI.
installGroups: [client]
---

# Accessibility Rules

shadcn components are accessible ONLY when used properly — the rules below are the
"properly". They apply to every page, public or logged-in. This skill owns heading hierarchy,
landmarks and image alt text app-wide (below); `pikku-seo` covers only public-route SEO.

## Every input has a label

- Give every input a `<Label htmlFor>` — a placeholder is NOT a label (it
  disappears on input and is never announced as one). Placeholder = example value only.
- Wire validation and help text to the input with `aria-describedby` (and `aria-invalid`) — a loose
  red paragraph next to the field is not announced with it.
- Icon-only controls (icon `Button`) MUST have `aria-label={m.key()}`
  naming the action ("Delete item", not "Trash icon").

## Interactive = a real button or link

- Never `onClick` on a `div`/`Card` — it is invisible to keyboard and screen
  readers. Use `Button` or `<Link>`; navigation is a
  link (href), actions are buttons.
- Everything reachable by Tab, activatable by Enter/Space. Never remove focus outlines
  (the theme owns the focus ring), never set `tabIndex` greater than 0, never trap focus
  yourself.
- Whole-row/whole-card click: put the button/link INSIDE with the row as its label —
  don't make the container clickable and unfocusable.

## Don't say it with color alone

- Status must carry text or an icon, not only a color: a Badge says "Overdue", a form
  error has a message — a red tint by itself is invisible to colorblind users.
- Contrast comes from the theme; don't undermine it by stacking `text-muted-foreground` on small
  text over tinted backgrounds. Body copy stays at least AA-readable.
- Touch targets: WCAG 2.2 minimum 24px — don't shrink icon buttons or checkboxes below
  24px, and keep adjacent row actions spaced.

## Overlays and motion

- Modals/drawers: use shadcn `Sheet`/`Dialog` and ALWAYS include a `Title` — that is what
  gets announced; focus trap and Escape come built in. (This project uses drawers, not
  dialogs.)
- Landing-page animation (the only custom-CSS surface) respects
  `prefers-reduced-motion: reduce` — gate transforms/parallax behind the media query.

## Self-check before declaring UI done

Tab through the page once: every control reachable and visibly focused, every input
labeled, every icon button named, every status readable without color. A browser
scenario proves the flow works, not that it is reachable without a mouse — this
manual pass is the only check that does.

## Headings, landmarks, alt text (app-wide)

- Exactly one h1 per page, naming its topic. Below it: h1 → h2 → h3, no skipped levels.
  Never pick a level for its font size — set the size on the correct level
  (`<h2 className="text-sm">`).
- Landmarks on every page: `<nav>`, `<main>`, `<footer>` where present (render the element itself, `<nav>`, rather than a `<div>` with a role).
- Every meaningful `<img>` has alt text describing it; decorative images get `alt=""`.
