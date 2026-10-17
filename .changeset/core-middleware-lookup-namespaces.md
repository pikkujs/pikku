---
'@pikku/core': patch
---

Wire-level and channel middleware named in metadata are looked up in the package's own namespace before the application's, instead of only the application's (#267). The middleware chain caches are keyed by package as well as wire id, so an addon function and an application function with the same wire id no longer share one cached chain — whichever ran first used to decide the gates of both.
