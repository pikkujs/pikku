---
'@pikku/openapi-parser': patch
'@pikku/cli': patch
'@pikku/skills': patch
---

An addon generated with `pikku new addon --openapi` never built. Every function file declared its zod schemas next to an import of `#pikku/function`, and `pikku all` loads the file that declares a schema to convert it. At runtime `#pikku` resolves through the addon's `imports` into `dist/`, which the first build has not written yet, so every schema failed with `Could not convert Zod schema … Cannot find module …/dist/.pikku/function/index.js` and the build stopped there. Each operation's schemas now go in a sibling `<operation>.schemas.ts` that imports only zod, and the function file imports them from it.

The generated imports also named the wrong tree. An addon's generated code lives under `.pikku/addon/`, so `#pikku/function` and `#pikku/variables/…` pointed at leaves that do not exist, and `tsc` failed even once codegen had run. They are now `#pikku/addon/function` and `#pikku/addon/variables/…`, as the hand-written addon scaffold already had them.

`pikku validate` now reports an installed Pikku package that resolves a different copy of a type-identity package (`zod`, `kysely`, `@pikku/core`, `better-auth`) than the project as an error, `skewed-type-identity-…`, and the codegen preflight warns about it as `PKU719`. Under bun's isolated layout `@pikku/cli` can carry its own `zod` beside it in the store. Codegen then reads the app's schemas with a different zod than wrote them, and correct schemas fail to convert. The existing check only looked at dependencies linked from outside the project, so it never saw this case.

The `pikku-build` skill now recognises an OpenAPI spec or an n8n export handed over with the request, says so, converts it first, then carries on building the app. `pikku-addon` gains an OpenAPI reference and corrects its addon import paths and build steps. `pikku-n8n-import` joins the `core` install group.
