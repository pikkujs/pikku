---
"@pikku/cli": patch
---

Add React Query hooks generation from RPC map. New `reactQueryFile` option in `clientFiles` config generates typed `usePikkuQuery`, `usePikkuMutation`, and `usePikkuInfiniteQuery` hooks, plus workflow hooks (`useRunWorkflow`, `useStartWorkflow`, `useWorkflowStatus`). Infinite query is type-constrained to RPCs whose output includes `nextCursor`.
