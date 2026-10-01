---
'@pikku/code-edit': patch
'@pikku/cli': patch
'@pikku/addon-console': patch
'@pikku/inspector': patch
---

Add `pikku verify`: codegen, the backend and frontend type-checks and static correctness checks (stale table zod, orphaned child routes, dataless detail routes, asI18n misuse, broken message catalogs) as structured findings with fix hints. The library lives at `@pikku/code-edit/verify`; the console exposes it as `runVerify` and `getVerifyResults`. The inspector warns about single-step workflows (PKU644) and PKU111 now names the file and line.
