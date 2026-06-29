---
'@pikku/inspector': patch
---

feat(inspector): add PKU940 — block type casts on rpc.invoke() calls

The inspector now emits a critical PKU940 error when `rpc.invoke()` is called
with an `as` cast on an argument (`rpc.invoke('fn', data as any)`) or when its
result is cast (`rpc.invoke('fn', data) as any`). Both patterns defeat Pikku's
generated type safety and are rejected at build time.
