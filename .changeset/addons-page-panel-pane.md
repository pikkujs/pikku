---
'@pikku/console': patch
---

Let the addons page render the panel an addon now opens in.

Addon detail used to be `AddonDetailDrawer`, an overlay that rendered itself
wherever the page happened to put it, so the addons list correctly asked
`ResizablePanelLayout` to skip its panel pane — the page had no panels.

Moving addon detail into the panel system left that `hidePanel` behind. The
pane was never rendered, so clicking a not-yet-installed addon called
`openPanel` and nothing appeared: no detail, no install form, no way to add an
addon to a project from the gallery.

The pane is collapsed to zero width until something opens in it, so the
gallery still gets the full surface when no addon is selected.
