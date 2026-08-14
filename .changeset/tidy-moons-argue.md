---
'@pikku/console': patch
---

A screen's list is now a card of its own on the content column's start edge,
the mirror of the detail panel on the other edge, instead of a bordered column
welded inside the page card — so choosing what the page shows and showing it
are two surfaces, and the list can collapse to a rail without the page keeping
its width. `EdgePanel` is the shared portal-and-reserve plumbing both edges are
built from, `PanelInsetProvider` now tracks which edge each panel reserves, and
`ConsoleListPanel` is the start-edge card. `PanelHeaderBand` also gained the
hairline every other header row on screen already had.
