---
'@pikku/cli': patch
'@pikku/playwright': patch
---

`pikku pages list` reads a frontend's pages from its TanStack Router route files, and `pikku pages screenshot` photographs them on a running server, signed out or as a persona (`--as`), reporting HTTP status and console/page/API errors per page. `@pikku/playwright` exports `openPageSession`, `screenshotPages` and `screenshotName`.
