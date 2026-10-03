---
'@pikku/console': patch
'@pikku/addon-console': patch
'@pikku/code-edit': patch
---

The Code page type-checks on the server, exactly as `tsc` would: each file is checked against its own tsconfig, including unsaved edits, so imports like `#pikku/*` resolve. New `TypeScriptService` at `@pikku/code-edit/typescript` and a `console:getFileDiagnostics` RPC. The header shows the open file's path as a breadcrumb.
