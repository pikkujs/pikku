---
'@pikku/console': patch
---

Stop the three-pane layout drawing a details pane the host already draws.

`ThreePaneLayout` renders its own `PanelContainer` in a right-hand column, fed
by the same panel context a host reads. A host that owns the chrome mounts that
container itself — as an end-edge panel, or a sheet on a phone — so opening a
panel showed its body twice at once, once in the column and once in the host's
panel.

The column now follows `ConsoleChromeContext` the way `ResizablePanelLayout`
already does: with `chrome="host"` it and its collapse rail are not rendered,
and the panel opens only where the host put it. Standalone, nothing changes.
