---
'@pikku/n8n-import': patch
'@pikku/cli': patch
---

`@pikku/n8n-import` no longer depends on `@pikku/inspector-go`, so it stays MIT. `parseN8n` takes an optional third argument `{ hasSyntaxError }`, a function that reports whether a Code-node body has TypeScript syntax errors; `pikku import n8n` passes the `@pikku/inspector-go` parser. Without it the syntax check is skipped.
