---
'@pikku/cli': minor
---

Generated React Query hooks gain `usePikkuQueryStub` and `usePikkuMutationStub`, plus `registerMocks`. In dev and mock mode a stub answers with the RPC's default mock from `.mocks/`; in production it is the plain hook, so an RPC without a function 404s.
