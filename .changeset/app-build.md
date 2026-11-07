---
'@pikku/cli': patch
'@pikku/skills': patch
---

Add `pikku app build`, which runs each deployed frontend's own `build` script in its directory, side by side, and exits non-zero if any app fails.
