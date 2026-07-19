---
'@pikku/inspector': patch
---

Extract `wireScope` declarations and validate scope references.

Functions referencing a scope that no `wireScope` declares now fail the build
with an `INVALID_VALUE` critical listing the available scopes, so a typo like
`admin:invoice:create` is caught at codegen rather than at runtime.

`wireScope` declarations wrapped in a cast (`as const`, `as any`) are unwrapped
before extraction rather than being silently skipped.
