---
---

Root build script only: `build:addons` now runs ahead of `yarn pikku`, so an
HTTP route whose handler is an addon ref has something to resolve against when
the apps are generated. No published package changes.
