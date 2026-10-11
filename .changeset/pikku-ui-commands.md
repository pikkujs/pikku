---
'@pikku/cli': patch
'@pikku/code-edit': patch
'@pikku/playwright': patch
---

`pikku ui theme list|apply`, `pikku ui design placeholders|favicon|extract|images|crawl` and `pikku ui pages list|screenshot` put theme, brand and page tooling in the CLI. `pikku dev` starts the design server when `@pikku/design-server` is installed or `PIKKU_STUDIO_DESIGN` points at one. `@pikku/playwright` exports `openPageSession`, `screenshotPages` and `screenshotName`, and the generated theme header names `pikku ui theme apply`.
