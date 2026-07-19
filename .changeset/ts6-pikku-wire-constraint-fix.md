---
"@pikku/core": patch
---

Fix a TypeScript 6 `PikkuWire` constraint collapse that made `rpc` a required field: narrow `PikkuRPC` default type params from `any` to `Function` and replace bare `any` TypedRPC args with `PikkuRPC`.
