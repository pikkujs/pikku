---
'@pikku/mongodb': patch
---

The `@pikku/mongodb` test script downloads the mongod binary once before its parallel test workers start, so two workers no longer race to download it into a cold cache and fail with a lockfile error.
