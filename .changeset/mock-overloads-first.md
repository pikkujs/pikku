---
'@pikku/cli': patch
---

The `mock: true` overloads of `pikkuFunc` and `pikkuSessionlessFunc` come before the ones with a body, so a bad `scopes` or `permissions` value is reported on that property again instead of on `func` with "not assignable to `undefined`".
