# Prototype first

Read this when the person wants to see and click through the app before it is
built for real. Four stages. Each ends with the person saying yes before the
next one starts. This file is the outline; the detail of each stage is still to
be filled in.

Never say "mock", "mockup" or "wireframe" to the person (`references/design.md`).
Say "screens" for stages 1 and 2 and "prototype" for stage 3.

## 1. Direction

Explore what the product could feel like.

1. State the direction in words and write it to `knowledge/decisions/design/`
   (`references/design.md`).
2. Draw the first screens as artifacts, under `artifacts/`.
3. Give the artifact a Preview tab: the options to switch between, and a way to
   ask for more.

Done when the person has picked a direction.

## 2. More screens

Draw a few more screens in the chosen direction, as artifacts, to check that the
direction holds beyond the first screen.

Done when the person has approved the screens.

## 3. Prototype

Turn the approved screens into a small app the person can click through.

1. It is a TanStack Start app in `apps/prototype`, with real routes and one route
   file per page.
2. Tailwind and shadcn only. No hooks, no data layer, no i18n, no paraglide.
3. Each page keeps its sample data as one `const sample` at the top and its copy
   as plain strings in the markup.
4. Pages link only to pages that exist in the prototype. Anything not built yet
   is a "Not built yet" page.
5. Design lives in the theme tokens and the shadcn component variants, not in
   one-off class overrides. The prototype's own `AGENTS.md` says the design
   agent may change any of it.
6. Check every page against its approved screen before showing it: sizes,
   radii, fonts and colours measured for each state, light and dark, and no
   class that generated no CSS.

Done when the person has clicked through it and approved it.

## 4. Productise

Only when the person says yes. Not written yet. In outline: trim what exists
only for the prototype, replace the sample data with real data, move the copy
into messages, extract blocks, add tests.
