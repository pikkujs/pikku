# Data the backend does not have yet

Read this when a screen needs data no function returns yet, or returns in a different shape. Real functions come first; mock only what is missing.

## Three ways to get data

- `usePikkuQuery('rpc:name')` and `usePikkuMutation('rpc:name')` take only RPCs that exist, with the function's own types. `api.gen.ts` lists them. Use these whenever a function fits.
- Mocks are files, not code: `.mocks/<rpc.name>/<scenario>.json` is exactly what the RPC answers, and `<scenario>.meta.json` beside it holds `label`, `description`, `state` (healthy, empty, error or slow), `default`, `delayMs` and `status`. Exactly one scenario per RPC has `default: true`. Add an empty and an error scenario for every list and every mutation.
- `usePikkuQueryStub('rpc:name')` and `usePikkuMutationStub('rpc:name')` always answer from the mock, and their output type is inferred from the mock files. Use a stub only when the function's types are not enough: no function exists, or the shape the screen needs differs from the function's output. If the mock already fits the function, use `usePikkuQuery`.

With `VITE_MOCK` set the plain hooks answer from the default mock too, so every state of every screen can be looked at without a backend.

## Publishing

A stub with no `{ featureFlag }` works in development and cannot be published. `usePikkuQueryStub('rpc:name', { featureFlag: 'flag' })` can, as long as the flag is declared in the project. Production never ships mock data; a stub there is a plain call that gets a 404.

## Making a screen real

`pikku mocks check` lists every stub and blocks the unflagged ones. For each stub: implement the function so its output matches the mock, replace the stub with `usePikkuQuery`, delete the flag if nothing else uses it. `pikku mocks diff` shows what changed, what is unused and what is dead; delete a mock directory it reports as removed.

## Screens built on mocks

The screens are the real app's: real components, `m.*()` for every string, the theme tokens. Only the data is sample. Make it look lived in: at least six realistic records where a page lists things, real copy, tinted and textured placeholder images instead of flat grey boxes. A button that leads nowhere real stays inert.
