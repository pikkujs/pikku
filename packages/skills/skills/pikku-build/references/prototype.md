# Prototype first

Read this when the person wants to see and click through the app before it is
built for real. Three stages. Each ends with the person saying yes before the
next one starts. This file is the outline; the detail of each stage is still to
be filled in.

Never say "mock", "mockup" or "wireframe" to the person (`references/design.md`).
Say "screens" for stage 1 and "prototype" for stage 2.

## 1. Explore

Pictures of what the product could feel like, as artifacts (`pikku-artifacts`,
`references/explore.md`). Free-form: any layout, any look. Tailwind only, with
the shadcn token names, no custom CSS.

1. State the direction in words and write it to `knowledge/decisions/design/`
   (`references/design.md`).
2. Draw the first few screens of two or three different directions, under
   `artifacts/`. The person can ask for more screens in any direction, or for
   more directions.
3. The page declares the states it supports. It never draws its own preview bar.

Done when the person has picked one direction. Only the screens of that direction
carry on.

## 2. Prototype

Turn the picked screens into a small app the person can click through, then grow
it from there along the happy path. There is no separate "more screens" step.

Nothing real is built: no backend, no data, no tests, no types, no translations.

The app is `apps/prototype`, which ships in the starter template. It is a
TanStack Start app with Tailwind and the Preview drawer in `src/skin.tsx`, and
nothing else: no palette, no fonts, no components. The design is yours to make.
Start from it; do not scaffold another app, and do not run `pikku bootstrap`,
`pikku all`, `pikku db`, `bun run dev` at the root, `tsc` or the scenario runner.
Do not touch `apps/app`, `packages` or `db`. Install and run only inside
`apps/prototype` (`bun install`, `bun run dev`).

0. Design first. With approved screens, take the direction from them; with only
   a brief, choose it from the brief. Write the tokens in `src/styles.css`
   before any page: palette, fonts, radius, shadows, light and dark. Then add the
   shadcn components you need with `bunx --bun shadcn@latest add <names> -y`;
   they read the tokens, so a component added first renders unstyled.
1. One route file per page, in `src/routes`. Pages link to each other along the
   happy path only (the one journey that shows the product). A button that leads
   nowhere real stays inert. A page nobody asked for is not built.
2. Tailwind and the shadcn components only, always. Use the component for the
   job; add a variant to it rather than restyling at the call site. No custom
   CSS beyond theme tokens, no invented class names (a class Tailwind does not
   know silently generates nothing).
3. Pages are composed from blocks in `src/blocks`. A block owns its markup and
   reads its data through a hook in `src/hooks`: a TanStack Query hook whose
   queryFn is `stub(data, empty)` (`src/hooks/stub.ts`). Mutations are
   `useMutation` over `stub()` that update the cache. The data is literals in the
   hook file, with hand-written types. `stub()` answers the preview state
   (`?show=loading|error|empty`), so every page gets those views without code.
   Nothing fetches, nothing persists. Productising replaces the `stub()` calls
   and nothing else.
4. Copy is plain strings in the markup. No i18n, no paraglide.
5. The Preview drawer is how the person moves around. Add each page to `pages` in
   `src/skin.tsx`, and its other states (empty, loading, error, a dark look) to
   `states`. It also gives the Size presets and the Look switch for free.
6. Design lives in the tokens in `src/styles.css` and the component variants.
   The prototype's own `AGENTS.md` says the design agent may change any of it.
   There are no image files: use a tinted placeholder block until the person
   supplies pictures.
7. Run `node scripts/unknown-classes.mjs` (it must report 0; it also catches a
   token you used but never defined) and open each page
   once to see it. That is the whole check at this stage. Measuring against the
   approved screens is for when there are approved screens to measure against.

Speed is part of the job: the first page is viewable within a couple of
minutes, then fill it out. A page that is a skeleton is not done.

Each page is complete for its kind, with real copy and at least six realistic
records where it lists things:

- **Landing or home:** a full hero (headline, subline, call to action, large
  image area), a featured group, a row of the newest items, a story or
  how-it-works section with its own image, social proof, a signup, a real
  footer.
- **Detail page:** an image gallery with thumbnails, title, price, the choices
  (options, quantity), the main action, a short story, an expandable details
  section, and related items.
- **Cart or list with totals:** rows with image, options and a quantity stepper,
  a summary with every cost, a code field, the main action, and the empty state.

Placeholder images are tinted and textured on purpose (gradients, shapes), never
a flat grey box.

Done when the person has clicked through it and approved it.

### Port, do not copy

The picked screens are free-form; the prototype is not. Every part of a picked
screen becomes one of: a component or block that already exists, restyled through
tokens; a new variant of an existing component; or a new block or component added
on purpose. Nothing stays as hand-written markup in a page, because every
user-visible string must sit in a block for i18n later. Write a short ledger of
the variants and blocks you had to invent and show it with the prototype.

### In an app that already exists

The prototype is a staging area for one feature, not a mirror of the app. It
imports the app's real components and blocks, so its look can never go stale
against them. The data is always fake, for the existing blocks too: blocks get
their data through a hook, and the prototype aliases every one of those hooks to
a stub (or provides a client whose queryFns are `stub()`). Nothing reads or writes real data. The new blocks are written to move into
the app unchanged. When the feature is approved, productising swaps their stubs
for the real hooks and the prototype is deleted. The next feature starts a new one
against the app as it is by then.

## 3. Productise

Only when the person says yes. Not written yet. In outline: trim what exists
only for the prototype, replace the sample data with real data, move the copy
into messages, extract blocks, add tests.
