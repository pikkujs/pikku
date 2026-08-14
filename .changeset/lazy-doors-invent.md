---
'@pikku/console': patch
---

Give every side surface a phone path, and the sheet a primary action.

The runs pane, the three workspace navigators (features, virtual users, notes)
and the email compose form were welded into the page card as a second column,
which a phone has no room for. They now declare themselves through
`PageOptionsPortal` and open from the foot bar instead, dismissing the sheet
from their own select handler.

`PageOptionsProvider` gained a primary-action slot: `usePageAction` registers a
page's main verb — "New workflow run" — and the chrome pins it above the sheet
body. Panels rendered outside the provider are unaffected, so a standalone
render harness still works.

New `ConsoleSidePanel` puts static content (a form, an inspector) on the end
edge as its own floating card, the mirror of `ConsoleListPanel`;
`ResizablePanelLayout` takes it as `sidePanel`.
