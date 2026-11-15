---
type: decision
title: Mock mode is a client given to PikkuProvider, not a branch in the hooks
description: createMockPikku (generated mocks.gen.ts) returns a PikkuInstance that answers rpc.invoke from .mocks/; screens keep usePikkuQuery/usePikkuMutation. A story picks a scenario with setMockScenario; flagged mode mocks only `mock: true` functions and sends the rest to a real fallback.
tags: cli, codegen, mocks, react-query, sdk
---

# Mock mode is a client given to PikkuProvider, not a branch in the hooks

The front end has no mock concept. Every generated hook already takes its client
from `PikkuProvider` (`usePikkuRPC`, `usePikkuFetch`), so mock mode is a different
client handed to the provider: `createMockPikku(options?)` from the generated
`mocks.gen.ts`. Its `rpc.invoke(name, data)` answers from the `.mocks/` library,
which also makes `usePikkuInfiniteQuery` (which never had a mock branch) work
with no change.

- **Where the code lives.** The scenario lookup, the selection map
  (`setMockScenario`, `setMockScenarios`, `clearMockScenarios`), `mockResponse`
  and `createMockPikkuClient` are in the hooks file
  (`pikku-react-query.gen.ts`), because `mockSources` already lives there.
  `mocks.gen.ts` only adds `mockFlagged` and a `createMockPikku` that registers
  the library and passes the set; it re-exports the selection functions so a
  story imports one module.
- **Scenarios.** A scenario is a `.mocks/<fn>/<name>.json` file, selected by
  `<name>`. With none selected the default rule is unchanged (only files with a
  meta compete; app before addon; a lone one wins). The meta's `delayMs` is
  waited, and `state: 'error'` or a `status` of 400 or more rejects with an
  Error carrying `status` and the file as `body`.
- **Modes.** Without a fallback every call is mocked (`all`). With one the
  default is `flagged`: only the exposed RPC names whose function meta has
  `mock: true` (emitted as `mockFlagged`) are mocked, everything else, including
  every non-`invoke` member and `fetch`, goes to the fallback. A flagged function
  with no `.mocks/` data rejects naming the folder it needs. `mocks.gen.ts` is
  therefore emitted when `.mocks/` exists or any function is `mock: true`.
- **Session.** Without a fallback `fetch.fetch('/auth/get-session')` answers a
  null body, so `useSession` reads signed out instead of failing.
- **Query cache.** The query key stays `[name, data]`. `createMockPikku({ queryClient })`
  resets that client's queries of a function whenever its scenario changes
  (`dispose()` stops it); `resetMockQueries(queryClient, names?)` does it by hand.
  Putting the scenario in the key was rejected: the key is built by the hook,
  which must not know about mocks.

The `VITE_MOCK` branches in `usePikkuQuery` / `usePikkuMutation`, the stub hooks
and `pikku mocks` are left as they are until a later cleanup removes them.

A backend pass writes `mocks.gen.ts` one level deeper than the SDK it is moved
to, and `import.meta.glob` is not an import, so the SDK relocation re-points its
static directory (`repointGlobs` in `utils/backend-sdk.ts`); before that the
moved file globbed the folder above the project.
