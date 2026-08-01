---
'@pikku/console': patch
---

Open an addon or API in the panel instead of a drawer.

Picking a package from the catalogue slid a 620px right-hand `Drawer` over the
screen — across an embedding host's own end-edge panel, and across the very
catalogue it was describing.

It is now a panel type: `openPanel('addon', id, title, { addon, kind, editable,
onInstalled })` from `usePanelContext`, rendered by `PanelContainer` as the new
exported `AddonDetail`. `AddonDetailDrawer` is gone.

`AddonDetail` is self-sufficient rather than prop-driven, because a panel's
content is built from the metadata captured when it opened and that metadata is
never refreshed. It owns the install mutation (`console:installAddon`, or
`console:installOpenapiAddon` for `kind: 'api'`) and re-reads the shared
`['installed-addons']` query, so installing from the panel updates both the
panel's CTA and the catalogue behind it from one invalidation. The now-dead
`installingName` / `actionError` / `onInstall` / `installedNamespaces` plumbing
is dropped from `CommunityGallery`, `AddonsList` and `ApisList`.

`editable` is passed in rather than read from `useConsoleEditable()`: panel
content renders outside the page's provider tree, where that context would
silently fall back to its `true` default and offer Install on a read-only
deployed stage.
