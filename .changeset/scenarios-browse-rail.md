---
'@pikku/console': patch
---

Let a host mount the scenarios feature rail as its own panel.

The feature list was rendered as the scenarios layout's own drawer, and the
search, tag filter and picked feature that drive it lived inside
`ScenariosWorkspace` — so a host embedding `ScenariosPage` could not give the
rail the side-panel treatment its other screens use.

`useScenariosBrowse()` now owns that state and the filtered feature list. Hand it
to `ScenariosBrowseRail` to put the rail anywhere, and to `ScenariosPage` via the
new `browse` prop so the page drops its own drawer. This is the same shape
`usePackagesBrowse` / `PackagesBrowseRail` already gives the packages screen.

Standalone, nothing changes: with no `browse` the page mounts the state itself
and renders the rail exactly where it was.
