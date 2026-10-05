# Presentation: slides that look like the app

A deck drawn with the app's own theme and components: a pitch to the people who will
use it, a walkthrough of a new feature, what changed this week, or a plan for the
next build. Because every slide uses the app's tokens and control shapes, the deck
looks like the product, not like a slide template.

## The file

`artifacts/<slug>-vN.tsx`, one file per deck, built from the app's own components
(`.html` only when the app has none). One `<section>` per slide:

```jsx
export const title = 'Climbing gym: what members get'

export default function Deck() {
  return (
    <div data-artifact-kind="presentation">
      <section data-artifact-slide="What a member sees">…</section>
      <section data-artifact-slide="Checking in at the desk">…</section>
    </div>
  )
}
```

- Every slide is 16:9: `aspect-ratio: 16 / 9; width: 100%;` and nothing overflows it.
  Stack the slides with `scroll-snap-type: y mandatory` on the page and
  `scroll-snap-align: start` on each slide, so the file presents in a plain browser
  too.
- The slide's name in `data-artifact-slide` is its title in the person's words. The
  design view lists them.
- It is an addition in every other respect: the app's theme applies, so use the token
  names only, real components for controls, no preview bar of your own, and `x-`
  prefixes on anything you invent (see SKILL.md).

## What goes on a slide

- **One idea per slide**, said in a headline of at most ten words. The rest of the
  slide proves it.
- **Show the product, do not describe it.** Most slides are a screen, or the part of
  one that matters, drawn as the app draws it: the real card, table or form, with
  realistic content from their domain, framed on a quiet background. Take it from the
  approved artifacts or the built screens, so the deck never shows something the app
  does not do.
- Make it larger than life. Crop to the part that matters and scale it up. A whole
  screen shrunk onto a slide is unreadable.
- Supporting text is short, in the person's words, never in pikku jargon. Numbers are
  real or marked as an example.
- A drawn feature that is not built yet carries a visible "planned" badge on the
  slide.

## Shapes that work

- **Walkthrough**: one slide per step of the happy path, each showing the screen at
  that step with the thing to do highlighted.
- **Before and after**: the old screen and the new one side by side, with the
  difference marked.
- **What changed**: one slide per change, each showing the change itself, ending with
  what is next.
- **Pitch**: who it is for and their problem, then the product solving it in three or
  four screens, then what it takes to start.

Six to twelve slides. If it needs more, it is two decks.

## Discuss and version

Same as any artifact: the person's comments become `-v(N+1)`, and you never overwrite a
version they have seen. Stop when it is viewable.
