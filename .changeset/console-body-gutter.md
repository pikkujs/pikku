---
'@pikku/console': patch
---

Give the screen body one gutter, set by the chrome rather than by each layout.

Embedded in a host, `ResizablePanelLayout` zeroed its body padding on the
assumption that the host's page card supplied the gutter. A host card cannot: it
is a bare card, and padding it would inset the full-bleed header band at its top.
So every screen using that layout ran flush to the card's edge — the emails
screen most visibly.

The layouts were also disagreeing among themselves, one padding `xl`, another
`md`, so whether content touched the edge depended on which layout a screen
happened to use.

There is now a single `--console-body-gutter`, declared once per chrome mode
(`:root` for standalone, `.chromeHost` applied by `HostConsoleChrome` for
embedded) and read by `ResizablePanelLayout`, `ThreePaneLayout` and
`PageContainer`. Same host/self question `useListSurfaceClass` already answers
for the border, answered in the same place. Embedded is the tighter value: the
host's card is already inset from the app edge.
