# Addition: a new screen in an app that already has its look

The app exists, it has a theme and a layout, and the person wants something added or
changed. The picture must look like the app on the day it ships, so it is drawn inside
the app's own look, not a fresh one.

## 1. Read the app's look before drawing

- The theme: `packages/theme/themes/*.json` and the generated `theme.css`. Do not copy
  the values into the page. The design view applies the app's current theme, so the
  page only uses the token names.
- The shell: open the app's layout component (the nav, the header, the content
  width) and the nearest existing screen to the one you are adding. Draw the new
  screen inside a copy of that shell, so the person judges it in place, not floating.
- The components in `src/components/ui` and any blocks the app already uses. Reuse
  them. If the app already shows lists as a table, the new list is a table.

## 2. One file, several options

`artifacts/<slug>-v1.tsx`, where `<slug>` names the thing being added
(`invoice-reminders`), built from the app's own components (see SKILL.md for what may
be imported). Inside it, two or three options, each a section:

```jsx
export const title = 'Invoice reminders'

export default function InvoiceReminders() {
  return (
    <>
      <section data-artifact-option="Inline on the invoice">…</section>
      <section data-artifact-option="Own page under Billing">…</section>
    </>
  )
}
```

Use `.html` only when the app has no components yet.

- Options differ in what matters to the person: where it lives, how much it shows, how
  many steps it takes. Two colours of the same layout are not two options.
- Name each option in plain words that say the difference.
- Each option shows its `ready` state and, where the screen has them, `empty` and
  `problem` (see the preview contract in SKILL.md).
- One option is fine when the request leaves no real choice. Say so instead of
  inventing a second.

## 3. Discuss, then adopt

- A refine names an option and carries their words. Write `-v2` with that option
  changed, and keep the others unless they said to drop them.
- An adopt names the option to build. Record which one in the change, so the build reads
  `artifacts/<slug>-vN.html` and that `data-artifact-option`.

## 4. When the addition does not fit the look

If the new screen needs something the theme or components do not do, that is a
finding, not a reason to hand-roll it. Either change the drawing to use what exists, or
say that the theme needs a change and what change. Ask before changing the theme of a
running app: it changes every screen.
