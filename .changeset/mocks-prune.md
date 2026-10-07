---
'@pikku/cli': patch
---

`pikku mocks diff` and `check` now scan plain `usePikkuQuery`/`usePikkuMutation` calls too: a mock nothing calls is reported `removed` (no function) or `unused` (function exists), `check` fails a plain call to an RPC with no function and a stub whose mock is invalid or has no `.mocks/` directory, and warns about declared flags no stub uses. `check --strict` also fails on unused and dead mocks.
