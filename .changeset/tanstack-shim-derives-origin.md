---
'@pikku/cli': patch
---

Stop the TanStack Start shim throwing on every deployed page

`makeApi()` read `import.meta.env.VITE_API_URL` and threw `VITE_API_URL is not
set` when it was absent — which is what happens in a deployed bundle. Fabric
binds `VITE_API_URL` as a runtime binding on the worker, invisible to Vite at
build time, so the read is `undefined` and the shim threw on the first loader
that touched it. Codegen was shipping the failure `fabric validate` now fails
projects for.

The generated shim derives the base instead:

- **Browser** — `import.meta.env.VITE_API_URL` when the build inlined one,
  otherwise `window.location.origin + '/api'`. A configured base pointing at
  localhost while the page is served from a real origin is ignored: the browser
  cannot reach it, so it is a stray dev value.
- **SSR** — `PIKKU_API_URL` then `VITE_API_URL` from the environment, since
  there is no page to derive from. This is the one path that still throws when
  nothing is set, and it now names both variables. The environment is reached
  through `globalThis`, so the emitted file type-checks under a browser-only
  tsconfig with no Node types.

`apiBaseUrl()` is exported alongside `makeApi()` for code that needs the base
without an RPC client. This is the same resolution the shipping app templates
use.
