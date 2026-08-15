---
'@pikku/console': patch
---

feat(console): export the nav dock's preferences so an embedding app can move it

`<NavDock>` is presentational and already reads `useDockPrefs()` itself — the
side it sits on and whether it is held open (and so reserves its edge) come from
localStorage rather than props, precisely so the dock and the menu that moves it
can never disagree. But the only menu offering those controls lives inside
`ConsoleNavDock`, which an app embedding the dock replaces wholesale: it builds
its own zones from its own routes, and hands the dock its own account tile.

So an embedding app could mount the dock but never offer "put it on the left" or
"keep it visible", and its only route to the prefs was to restate the two storage
keys and hope they stay put. Fabric had exactly that copy.

`useDockPrefs`, `DOCK_SIDES`, `isVerticalDock` and `DockSide` are now part of the
package's surface. Nothing changes for the console itself.
