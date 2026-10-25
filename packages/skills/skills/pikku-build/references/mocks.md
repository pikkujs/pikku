# Data the backend does not have yet

Read this when a screen needs data no function returns yet, or returns in a different shape. Real functions come first; mock only what is missing.

## Three ways to get data

- `usePikkuQuery('rpc:name')` and `usePikkuMutation('rpc:name')` take only RPCs that exist, with the function's own types. `api.gen.ts` lists them. Use these whenever a function fits.
- Mocks are files, not code: `.mocks/<rpc.name>/<scenario>.json` is exactly what the RPC answers, and `<scenario>.meta.json` beside it holds `label`, `description`, `state` (healthy, empty, error or slow), `default`, `delayMs` and `status`. Exactly one scenario per RPC has `default: true`. Add an empty and an error scenario for every list and every mutation.
- `usePikkuQueryStub('rpc:name')` and `usePikkuMutationStub('rpc:name')` always answer from the mock, and their output type is inferred from the mock files. Use a stub only when the function's types are not enough: no function exists, or the shape the screen needs differs from the function's output. If the mock already fits the function, use `usePikkuQuery`.

The app loads its mocks with `registerPikkuMocks()` from the generated `mocks.gen.ts` beside `api.gen.ts`, called when `import.meta.env.DEV || import.meta.env.VITE_MOCK`. It covers the app's `.mocks/` and every wired addon's, so never glob `.mocks` or `node_modules` by hand.

## Adding a mock

`pikku mocks add <rpc>` does the whole job. It checks the RPC is a real function, writes `.mocks/<rpc with : as .>/<state>.json` and `<state>.meta.json`, keeps exactly one default (the first mock is the default, `--default` moves it) and prints the stub hook to use. The response comes from `--body '<json>'` or `--from <file>`; an error mock and an empty mock of a list have a default body.

```
pikku mocks add classes:month --body '[{"id":"c1","name":"Yoga"}]' --flag classMonth
pikku mocks add classes:month --state empty
pikku mocks add classes:month --state error --status 500
```

`--flag <name>` declares the flag in the project's `defineFeatureFlags({ ... })` file when it is not there yet, or prints the entry to add by hand. Nothing is overwritten without `--force`. A body that differs from the function's output is written anyway and reported, because a stub may stand in for data the function does not return yet.

## Addon mocks

An addon ships default mocks in its own package as `.mocks/<function>/<scenario>.json`, named without a namespace, and lists `.mocks` in `files`. An app that wires the addon as `studio` gets them as `studio:<function>`. The app's `.mocks/studio.<function>/` adds scenarios; one with the same name replaces the addon's, and a `default: true` in the app wins over the addon's default. Put mocks for an addon's functions in the addon, and only the app's own variations in the app.

With `VITE_MOCK` set the plain hooks answer from the default mock too, so every state of every screen can be looked at without a backend.

## Publishing

A stub with no `{ featureFlag }` works in development and cannot be published. `usePikkuQueryStub('rpc:name', { featureFlag: 'flag' })` can, as long as the flag is declared in the project. Production never ships mock data; a stub there is a plain call that gets a 404.

## Making a screen real

`pikku mocks check` lists every stub and blocks the unflagged ones. For each stub: implement the function so its output matches the mock, replace the stub with `usePikkuQuery`, delete the flag if nothing else uses it. `pikku mocks diff` shows what changed, what is unused and what is dead; delete a mock directory it reports as removed.

## Screens built on mocks

The screens are the real app's: real components, `m.*()` for every string, the theme tokens. Only the data is sample. Make it look lived in: at least six realistic records where a page lists things, real copy, tinted and textured placeholder images instead of flat grey boxes. A button that leads nowhere real stays inert.
