---
'@pikku/mantine': patch
'@pikku/console': patch
---

Require Mantine 9; drop the Mantine 8 peer range.

`@pikku/mantine` re-exports `@mantine/core` wholesale (`export * from
'@mantine/core'`), so its `^8 || ^9` peer range was never really satisfiable in
both directions: the set of exported names differs between the majors, and any
consumer symbol that exists in only one of them resolves for one peer and fails
for the other. `@pikku/console` sat on the v8 side of that split — it imported
`TypographyStylesProvider`, which v9 renamed to `Typography` — so installing it
alongside Mantine 9 failed at bundle time with two missing exports:

    "TypographyStylesProvider" is not exported by @pikku/mantine/core
    "createOptionalContext" is not exported by @mantine/core   (via @mantine/code-highlight@8)

The second came from `@mantine/code-highlight`, which `@pikku/console` pinned
to `^8.3.18` while the host resolved core to 9 — a v8 satellite calling a core
helper that v9 removed. Pinning every `@mantine/*` dependency to the same major
is what makes that class of error impossible, so all eight move together.

Consumers on Mantine 8 must upgrade to 9 alongside this release. The migration
in this repo was small: `TypographyStylesProvider` → `Typography` (2 files) and
`<Collapse in>` → `<Collapse expanded>` (3 files). No other v9 breaking change
was reachable — no `createPolymorphicComponent`, `positionDependencies`, `Grid
gutter`, `Text`/`Anchor` `color`, or affected hooks (`useFullscreen`,
`useResizeObserver`, `useMouse`, `useMutationObserver`, `useTree`).
