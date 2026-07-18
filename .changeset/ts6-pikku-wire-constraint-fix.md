---
"@pikku/core": patch
---

Fix TypeScript 6 PikkuWire constraint collapse for rpc field

TypeScript 6 collapses `Partial<{field: any}>` to `{field: any}` (required) when the type arg is bare `any`, because `any | undefined = any`. This caused the generated `.gen.ts` files to fail type-checking because `rpc` appeared as a required field.

Changes: narrowed `PikkuRPC` default type params from `any` to `Function`, and replaced bare `any` TypedRPC args in `CorePikkuPermission` and related types with `PikkuRPC`.
