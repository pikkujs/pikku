---
name: pikku-a11y
description: >-
  Accessibility rules (WCAG 2.2) for the app UI: labeled inputs, real buttons/links, keyboard and focus, contrast and not-color-alone, modals, reduced motion.
  TRIGGER when: building forms or any interactive UI, icon-only buttons, modals/drawers, tables/lists with actions, keyboard/focus work, or the user mentions accessibility / screen readers / WCAG.
  DO NOT TRIGGER when: working on backend functions, database, or deployment with no UI.
installGroups: [client]
---

# Accessibility Rules

Mantine components are accessible ONLY when used properly — the rules below are the
"properly". They apply to every page; heading order, landmarks, and image alt text are
covered in the `pikku-seo` skill and apply app-wide, not just on public pages.

## Every input has a label

- Use the `label` prop on every Mantine input — a placeholder is NOT a label (it
  disappears on input and is never announced as one). Placeholder = example value only.
- Use the `error` and `description` props for validation/help text — Mantine associates
  them with the input for screen readers; a loose `<Text c="red">` next to the field
  does not.
- Icon-only controls (`ActionIcon`, icon `Button`) MUST have `aria-label={m.key()}`
  naming the action ("Delete item", not "Trash icon").

## Interactive = a real button or link

- Never `onClick` on a `div`/`Box`/`Card` — it is invisible to keyboard and screen
  readers. Use `Button`, `ActionIcon`, `UnstyledButton`, or `<Link>`; navigation is a
  link (href), actions are buttons.
- Everything reachable by Tab, activatable by Enter/Space. Never remove focus outlines
  (the theme owns the focus ring), never set `tabIndex` greater than 0, never trap focus
  yourself.
- Whole-row/whole-card click: put the button/link INSIDE with the row as its label —
  don't make the container clickable and unfocusable.

## Don't say it with color alone

- Status must carry text or an icon, not only a color: a Badge says "Overdue", a form
  error has a message — a red tint by itself is invisible to colorblind users.
- Contrast comes from the theme; don't undermine it by stacking `c="dimmed"` on small
  text over tinted backgrounds. Body copy stays at least AA-readable.
- Touch targets: WCAG 2.2 minimum 24px — don't shrink `ActionIcon`/`Checkbox` below
  size `sm`, and keep adjacent row actions spaced.

## Overlays and motion

- Modals/drawers: use Mantine `Modal`/`Drawer` and ALWAYS pass `title` — that is what
  gets announced; focus trap and Escape come built in. (This project uses drawers, not
  dialogs.)
- Landing-page animation (the only custom-CSS surface) respects
  `prefers-reduced-motion: reduce` — gate transforms/parallax behind the media query.

## Self-check before declaring UI done

Tab through the page once: every control reachable and visibly focused, every input
labeled, every icon button named, every status readable without color. A browser
scenario proves the flow works, not that it is reachable without a mouse — this
manual pass is the only check that does.
