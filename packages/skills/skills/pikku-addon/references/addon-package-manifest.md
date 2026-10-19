# Addon Package Manifest Reference

## Contents

- Package Structure
- pikku.config.json
- package.json (key fields)
- Platform service contributors (`defineContributors`)
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
  "srcDirectories": ["src", "types"],
  "outDir": "./.pikku",
  "addon": true,
  "node": {
    "displayName": "My Addon",
    "description": "What this addon does",
    "categories": ["General"]
  }
}
```

`outDir` stays `./.pikku`; `addon: true` is what appends the `addon` segment.

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

## Platform service contributors (`defineContributors`)

An addon can ship code that builds services for the **host's** target — a log
source over the host's database, a client built from a host secret. The addon
registers them in code with `defineContributors`; nothing goes in `package.json`
and `wireAddon` of the addon itself has no field for it. A host that wants one
opts in by name with `wireAddon({ contributors: ['log-sources'] })`, and gets
nothing it did not list.

```ts
// src/contributors.ts
import { defineContributors } from '@pikku/core/contributors'
import { logSourcesDev } from './log-sources-dev.js'
import { logSourcesDeploy } from './log-sources-deploy.js'

export const contributors = defineContributors({
  'log-sources': { dev: logSourcesDev, deploy: logSourcesDeploy },
})
```

```ts
// src/log-sources-deploy.ts — each variant in its OWN module
import type { Contributor } from '@pikku/core/contributors'
import { kyselyLogSource } from './log-source.js'

export const logSourcesDeploy: Contributor = {
  needs: ['kysely'], // runtime.kysely, or a contributor's services.kysely
  provides: ['logSources', 'logSources.workspace'],
  run: (services, _env, runtime) => {
    services.logSources = { workspace: kyselyLogSource(runtime.kysely) }
  },
}
```

Rules the inspector and the build enforce:

- `defineContributors` takes an object literal keyed by contributor name; each
  `dev` / `deploy` value must be a reference to an `export const`. Anything else
  is PKU360; a name defined twice is PKU361.
- **Each variant lives in its own module.** The build imports the module that
  exports the selected variant, so a `dev` and a `deploy` variant sharing a file
  both reach every bundle, production included.
- A contributor with no variant for a target is simply not part of it.
- Run `pikku all` in the addon: it writes
  `.pikku/contributors/pikku-contributors-meta.gen.json`, which a host reads to
  opt in (an unknown name is PKU363). Ship `.pikku` in `files`.
- `pikku.contributors` in `package.json` is removed and is now an error
  (PKU364), not silently ignored.
- Contributors run after every contributor providing one of their `needs`; a
  dotted need (`logSources.stage`) is met by a provider of the key or its
  prefix. `run` reads services the target built before it as `runtime.<name>` —
  `pikku dev` has logger, variables, secrets, schema and (with `db`) kysely; the
  standalone entry has logger, kysely (with a database) and its
  scheduler/queue/workflow/trigger services and event hub.
- Two contributors providing the same key (after `when` / `requires` filtering)
  is a build error naming both, except that a target's baseline services may be
  replaced. A decorator declares `provides: []`. A contributor providing what it
  needs is a cycle. An unmet `needs` is a build error.
- `requires: ['cloudflare']` on a contributor a host opted in to, for a target
  that cannot supply it, is a build error; use `when` to say "not here".
- `onServerStart` / `onServerStop` run only where the server lifecycle runs
  (dev, serve, standalone, generic server entry, Cloudflare container). On a
  Worker `onServerStart` is a build error and `onServerStop` a warning.
- Fail closed: a contributor whose bindings are missing at startup throws.

Full reference: `docs/contributors.md` in the pikku repo.

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
