---
"@pikku/cli": patch
---

fix(deploy): surface Bun.build AggregateError details in bundle failure messages

Bun.build() throws an AggregateError with per-file resolution errors in its
`errors` array (not in `.message`). The bundler now includes those messages
so build logs show the actual "Could not resolve: X" reason instead of a
bare "Bundle failed".
