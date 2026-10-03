---
'@pikku/console': patch
'@pikku/addon-console': patch
'@pikku/code-edit': patch
---

A Code page at `/code`, the same as fabric's: a collapsible file tree beside a Monaco editor. Files open editable, and Save or ⌘S writes them to disk through the new `console:writeProjectFile` RPC (`files:write` scope, local only). Binary and cut-short files open read-only. Writes to `.env` files, `.dev.vars` and ignored folders are refused.
