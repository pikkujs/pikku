---
'@pikku/cli': minor
---

Add `pikku mocks check`: scans the frontend with the TypeScript compiler API and fails when a `usePikkuQueryStub` or `usePikkuMutationStub` call has no `featureFlag`, a non-literal flag, or a flag the project has not declared.
