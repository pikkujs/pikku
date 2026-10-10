---
'@pikku/cli': patch
'@pikku/inspector': patch
---

Add the `pikku verify` command over `@pikku/code-edit/verify`: codegen, the backend and frontend type-checks and static correctness checks as structured findings with fix hints. The inspector warns about single-step workflows (PKU644) and PKU111 now names the file and line.
