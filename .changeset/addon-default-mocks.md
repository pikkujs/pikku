---
'@pikku/cli': patch
---

Addons ship default mocks in `<addon>/.mocks/<fn>/`, loaded under the namespace the app wires them as. The app's `.mocks/<ns>.<fn>/` adds scenarios, replaces one with the same name, and its default wins. `pikku mocks check`, `diff`, `sync`, `validate` and the generated stub types read both, and a new generated `mocks.gen.ts` beside the React Query client exports `registerPikkuMocks()`, so apps no longer glob `.mocks` by hand. Scaffolded addons publish `.mocks`, and `pikku validate` reports an addon whose `.mocks` is not in `files`.
