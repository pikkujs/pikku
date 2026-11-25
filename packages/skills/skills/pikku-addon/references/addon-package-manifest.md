# Addon Package Manifest Reference

## Contents

- Package Structure
- pikku.config.json
- package.json (key fields)
- Platform services (`defineProvider`)
- tsconfig.json (key fields)

`npx pikku new addon` scaffolds these files. You rarely hand-edit them — consult this when wiring exports or config by hand.

## Package Structure

```text
my-addon/
├── package.json               # imports -> dist, exports -> dist
├── pikku.config.json          # addon: true + metadata
├── tsconfig.json              # #pikku path mapping (source side)
├── src/
│   ├── services.ts            # createSingletonServices (required)
│   └── functions/
│       └── *.function.ts      # Function definitions
├── types/
│   └── application-types.d.ts # SingletonServices interface
└── .pikku/addon/              # Generated (gitignored)
```

An addon's generated tree roots one level down, at `.pikku/addon/`, so its own
leaves are reached as `#pikku/addon/<leaf>` while an application's are
`#pikku/<leaf>`. `paths` are global to a tsx process rather than scoped to the
package that declared them, and the extra segment is what stops a linked addon's
`#pikku/function` from matching the _host application's_ flat leaf.

## pikku.config.json

```json
{
  "tsconfig": "./tsconfig.json",
  "addon": {
    "displayName": "My Addon",
    "description": "What this addon does",
    "categories": ["General"]
  }
}
```

Generated files go to `./.pikku`; the `addon` block (or `"addon": true`) is what
appends the `addon` segment. An addon declares no `backends`.

## package.json (key fields)

```json
{
  "name": "@my-org/addon-todos",
  "imports": {
    "#pikku/*.js": "./dist/.pikku/*.js",
    "#pikku/*": ["./dist/.pikku/*/index.js", "./dist/.pikku/*"]
  },
  "exports": {
    ".": { "types": "./dist/src/index.d.ts", "import": "./dist/src/index.js" },
    "./.pikku/*": "./dist/.pikku/addon/*",
    "./.pikku/pikku-metadata.gen.json": "./dist/.pikku/addon/pikku-metadata.gen.json",
    "./.pikku/rpc/pikku-rpc-wirings-map.internal.gen.js": {
      "types": "./dist/.pikku/addon/rpc/pikku-rpc-wirings-map.internal.gen.d.ts"
    },
    "./.pikku/db/pikku-db-meta.gen.json": "./dist/.pikku/addon/db/pikku-db-meta.gen.json"
  },
  "files": ["dist"],
  "peerDependencies": {
    "@pikku/core": "*",
    "zod": "^4"
  },
  "scripts": {
    "prebuild": "pikku all",
    "pikku": "pikku all",
    "build": "tsc && pikku dist"
  }
}
```

**`pikku.uses` names the addons this addon calls**, as
`{ "<alias>": "<package>@<range>" }`. The addon calls `<alias>:<fn>`, typed from
that package's SDK, and the app wiring it maps each alias with `wireAddon`
`uses` (see "Calling another addon" in the skill). The older list form,
`["kysely"]`, names keys the app must map, with no SDK or version check.

**`imports` names `dist`, never the source tree.** `files: ["dist"]` is the whole
published package, and `pikku dist` copies `.pikku` and `types` into it — so a
`#pikku/*` target under `./.pikku/` resolves for the author and for nobody else.
It is a silent break: the addon compiles, packs, installs and then throws
`Cannot find module '.../.pikku/addon/function/index.ts'` on first import in the
consuming app, out of a file the consumer never wrote. The addon's own `tsc`
does not read `imports` at all — tsconfig `paths` covers it, which is why the
two maps point at different trees.

`pikku all` does read `imports`, though: it loads each file that declares a zod
schema to convert it to JSON Schema, and at runtime `#pikku` resolves through
`imports`, into a `dist` the first build has not written yet. So a schema must
live in a file that never imports `#pikku` — see "Functions" in the skill.

**`exports` targets carry the `addon` segment; the subpaths do not.** A consumer
writes `@my-org/addon-todos/.pikku/rpc/...`, exactly as it would in an
application, and the leaf stays the package's own business.

## Platform services (`defineProvider`)

An addon can ship code that builds services for the **host's** target — a log
source over the host's database, a client built from a host secret. The addon
declares them in code with `defineProvider`; nothing goes in `package.json` and
`wireAddon` of the addon itself has no field for it. A host that wants one opts
in by name with `wireAddon({ providers: ['logSources'] })`, and gets nothing it
did not list. An opted-in service is not run everywhere: a target (`pikku dev`,
or one deploy unit) selects it only when a key it provides is destructured by the
functions, middleware or permissions that target includes, or by another selected
service. A service nothing reaches gets no variant check, no `onServerStart`
error and no import, so wiring it once does not need per-build wiring.

```ts
// src/services.ts
import { defineProvider } from '@pikku/core/provider'
import { logSourcesDev } from './log-sources-dev.js'
import { logSourcesDeploy } from './log-sources-deploy.js'

export const logSources = defineProvider({
  dev: logSourcesDev,
  deploy: logSourcesDeploy,
})
```

```ts
// src/log-sources-deploy.ts — each variant in its OWN module
import { kyselyLogSource } from './log-source.js'

export const logSourcesDeploy = ({ kysely }: { kysely: Kysely<any> }) => ({
  logSources: { workspace: kyselyLogSource(kysely) },
})
```

A factory takes `(services, env)`: the keys it destructures from `services` are
what it needs (a baseline key such as `kysely`, or another service's), and the
keys of the object it returns are what it provides. There is no `needs` or
`provides` list. A function is the same on every target; the object form gives
`dev`, `deploy` and `common` variants (a target's own overrides `common`) and an
optional `onServerStart`.

Rules the inspector and the build enforce:

- The argument is an inline function or an object literal. Each `dev` / `deploy` /
  `common` value is an inline function or a reference to an `export const`. A
  factory must destructure its first parameter by plain name (no rest element)
  and return an object type with known keys; anything else is PKU369, PKU371 or
  PKU372. A name exported twice is PKU376.
- **Each variant given by reference lives in its own module** (PKU375). The build
  imports the module that exports the selected variant, so a `dev` and a
  `deploy` variant sharing a file both reach every bundle, production included.
- A service with no variant for a target is simply not part of it, unless it
  provides a key that target needs: then the build fails.
- Run `pikku all` in the addon: it writes
  `.pikku/providers/pikku-providers-meta.gen.json`, which a host reads to opt in
  (an unknown name is PKU374). Ship `.pikku` in `files` and export
  `./.pikku/*`.
- A plain package that is not an addon declares services the same way and is
  wired with `wireAddon`; it needs a `pikku.config.json` with `"addon": true`.
- Services run after every service providing one of their needs. A target's
  baseline services are read as destructured keys — `pikku dev` holds its dev
  baseline (logger, queue, scheduler, email and the like, but no `variables`,
  `schema` or `secrets`) and kysely with `db`; the standalone entry has logger,
  kysely (with a database) and its scheduler/queue/workflow/trigger services and
  event hub.
- Two services providing the same key is a build error naming both, except that a
  target's baseline services may be replaced by one. A service providing what it
  needs is a cycle. An unmet need is a build error.
- `onServerStart` runs only where the server lifecycle runs (dev, serve,
  standalone, generic server entry, Cloudflare container). On a Worker it is a
  build error. Teardown is the provided value's own `stop()`, called in reverse
  build order.
- Fail closed: a service whose bindings are missing at startup throws.
- **Declare every variable and secret an addon provider reads** with
  `defineVariable` / `defineSecret`: its `env` holds only those names (and the
  host's `variableOverrides` / `secretOverrides`), and anything else is
  `env-denied`.
- A provider that provides `logger`, `secrets`, `variables`, `credentialService`,
  `auth` or `jwt` must say `replaces: [...]` (PKU394), and the host's
  `pikku-addons.lock` records it. Adding a need, a provided key or a `replaces`
  in a later version is PKU395 for the host until it runs
  `pikku all --approve-providers`; a host in CI (`--frozen`) fails (PKU396).
- Contribute to a list with `defineProvider({ addTo: collection })`, importing the
  collection (core's `analyticsSinks`, or one the addon declares with
  `defineProviderCollection`). A database addon has no `deploy:standalone`
  variant (the standalone entry opens its own, PKU397). Providers run in the host's
  process, so `wireRemoteAddon` cannot take them (PKU381).

Full reference: `docs/services.md` in the pikku repo.

## tsconfig.json (key fields)

```json
{
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "rootDir": ".",
    "outDir": "./dist",
    "paths": {
      "#pikku/*.js": ["./.pikku/*.ts"],
      "#pikku/*": ["./.pikku/*/index.ts", "./.pikku/*"]
    }
  },
  "include": ["src/**/*", "types/**/*", ".pikku/**/*.ts"],
  "exclude": ["node_modules", "dist", ".pikku/**/*.d.ts"]
}
```

`paths` resolves the source tree because `dist` does not exist yet on the build
that creates it. Both patterns are needed: the `.js` one reaches a generated
file (`#pikku/addon/variables/pikku-variables.gen.js`), the bare one reaches a
leaf's barrel (`#pikku/addon/function`). Keep the `.js` pattern first: both keys
share the `#pikku/` prefix, and TypeScript takes the first match of the longest
prefix rather than the most specific pattern. Node sorts by specificity and does
not care about the order.
