---
'@pikku/console': patch
---

feat(console): the shell — page card, end-edge panels, nav dock, phone layout

The console shared its PAGES with the fabric console that embeds them, and none
of the shell around those pages. Both drew a screen, opened a secondary surface
and navigated, and did each of those three things differently. This brings the
shell into the package as the one implementation, so an embedding app gets the
same silhouette instead of forking one.

- **The page card.** Every screen is one floating card on the canvas — header
  band at `--screen-header-height`, body below — merged with the existing
  `PageContainer`/`PanelCard`/`StatePage`/`PageHeader` so there is one card and
  not two. `ConsoleChromeContext` decides who paints it: `self` for the standalone
  console, `host` when an app draws the card and the screen sits flush inside it.

- **The end-edge panel.** A secondary surface is a sibling card pinned to the
  content area's end edge, and the page card SHRINKS beside it — no scrim, no
  drawer, and never a bordered column inside the page card, which could not
  collapse and so never gave the main content the full width. `ConsolePanel`,
  `CollapsiblePanel`, `PanelHeaderBand`, `ContentArea`, `PanelInsetProvider`,
  and `ConsoleScreen` for the composition.

- **The nav dock.** Navigation is a row of tiles floating in the card gutter at
  the foot of the window, replacing the 260px rail — so it reserves no layout
  and the page keeps the width the rail took. `NavDock` is presentational: it
  draws the `identity`/`pinned`/`contextual`/`utility` zones it is handed and
  the `isActive` predicate decides what a `match` token means, so an app models
  its own routes and gets the same row. `ConsoleNavDock` is this console's model,
  built from `useDefaultNavSections()`.

- **The phone.** Below the phone breakpoint a second column cannot exist, so the
  dock — a pointer surface on the edge a thumb needs — gives way to a bottom tab
  bar, and every tab raises the same `MobileSheet`: nav as the rail in a sheet,
  a page's own options rail via `PageOptionsPortal`, search as the palette.

`Sidebar` is still exported and is still the phone's nav sheet, which a row of
hover-raised tiles cannot be. The shell's geometry tokens are a plain stylesheet
(`@pikku/console/shell.css`, also pulled in by `@pikku/console/styles`) rather
than a CSS module reached through `composes:` — an undefined custom property
makes the whole `calc()` around it invalid, so their delivery cannot depend on
which card happened to be composed first.
