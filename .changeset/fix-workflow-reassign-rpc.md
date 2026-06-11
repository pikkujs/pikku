---
"@pikku/inspector": patch
"@pikku/cli": patch
---

Fix workflow DSL extractor treating `x = await workflow.do(...)` as a set-step when `x` was previously declared as `null`. The referenced function is now correctly registered in `invokedFunctions` and `internalFiles`, so it appears in the generated `pikku-functions.gen.ts`.
