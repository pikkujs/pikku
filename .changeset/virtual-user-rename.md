---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/inspector': patch
'@pikku/knowledge': patch
'@pikku/skills': patch
'@pikku/playwright': patch
'@pikku/kysely': patch
'@pikku/better-auth': patch
'@pikku/react': patch
'@pikku/addon-console': patch
---

Personas are now virtual users everywhere. `definePersonas` is `defineVirtualUsers`, `@pikku/core/persona` is folded into `@pikku/core/virtual-user`, `pikku persona …` is `pikku virtual-user …`, and the `persona` columns of `virtual_user_run` and `virtual_user_schedule` are `virtual_user` (a migration renames them in place). No aliases are kept.
