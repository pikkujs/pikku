---
'@pikku/cli': patch
'@pikku/inspector': patch
'@pikku/inspector-go': patch
---

`pikku validate` no longer fails a fresh starter template. The core-import rule now points `@pikku/core/flag` at `#pikku/scopes` and `@pikku/core/analytics` at `#pikku/analytics` (the scopes leaf also re-exports the `DeclaredFlag` type), and the component literal-string rule ignores strings inside class builders such as `cva`, `cn` and `clsx`, so a variant like `heading: 'font-heading text-xl'` is no longer read as text to translate.
