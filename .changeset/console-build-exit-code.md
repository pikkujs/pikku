---
'@pikku/addon-console': patch
---

Fix the `build` script masking failures. The trailing `2>/dev/null; true` sat outside the `&&` chain, so `yarn build` could exit `0` even when `pikku all` or `tsc` failed, hiding broken builds. `pikku all` and `tsc` failures now propagate, while each `.d.ts` copy step is independently tolerant (`|| true`) so a missing `rpc`/`agent`/`workflow` directory no longer blocks the others or fails the build.
