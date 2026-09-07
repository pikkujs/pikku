---
'@pikku/console': patch
---

Add per-screen help: a `?` in every page header opens a plain-language panel explaining the concept behind the screen, whose copy can point at real controls on the page (hovering a highlighted phrase rings the control it names). Help is keyed by route — a page opts into nothing — and a unit test fails when a route is neither written, pending, nor explicitly exempt. Ships the Functions screen's copy; hosts register their own screens with `registerHelpScreens`.
