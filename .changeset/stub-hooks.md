---
'@pikku/cli': patch
---

Generated React Query hooks gain `usePikkuQueryStub` and `usePikkuMutationStub` for RPCs that have `.mocks/<rpc>/` and no function. The stub names and their output types (the union of the non-error mocks, optional where scenarios differ) are generated from `.mocks/`, and an RPC with only error mocks fails codegen. Dev and `VITE_MOCK` answer from the default mock; production is a plain call that 404s. `usePikkuQuery` and `usePikkuMutation` still take only real RPC names and answer from a mock when `VITE_MOCK` is set and one exists.
