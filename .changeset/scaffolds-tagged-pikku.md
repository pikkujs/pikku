---
'@pikku/cli': patch
---

The analytics ingest, feature-flag resolver, realtime subscribe and channel CLI functions that `pikku all` scaffolds are tagged `pikku`, so tooling lists them as built-in rather than as the app's own functions. A test pins that every scaffold tags its functions.
