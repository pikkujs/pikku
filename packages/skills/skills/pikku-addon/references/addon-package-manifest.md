# Addon Package Manifest Reference

## Contents

- Package Structure
- pikku.config.json
- package.json (key fields)
- Platform service contributors (`pikku.contributors`)
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

## Platform service contributors (`pikku.contributors`)

An addon can ship code that runs in the **host's** generated
`createPlatformServices` — a log source over the host's database, a client
built from a host secret. `wireAddon` has no field for it; the package declares
it in its own `package.json`, the same shape as the host's `dev.contributors`:

```json
{
  "exports": {
    "./contributors": {
      "types": "./dist/src/contributors.d.ts",
      "import": "./dist/src/contributors.js"
    }
  },
  "pikku": {
    "contributors": [
      { "module": "@my-org/addon-logs/contributors", "export": "logSources" }
    ]
  }
}
```

`module` resolves from the addon's package directory. Every app that wires the
addon (not `wireRemoteAddon`) picks the contributors up: `pikku all` emits them
into `.pikku/pikku-dev-platform-services.gen.ts` for `pikku dev`, and
`pikku deploy plan` / `apply` hands them to the provider adapter, after the
app's own `deploy.contributors`.

Declare what a contributor reads and sets, rather than relying on list order:

```ts
export const logSources: PlatformServiceContributor = {
  name: 'log-sources',
  needs: ['kysely'], // runtime.kysely, or a contributor's services.kysely
  provides: ['logSources', 'logSources.workspace'],
  imports: [`import { kyselyLogSource } from '@my-org/addon-logs/log-source'`],
  emit: () => [
    `  services.logSources = { workspace: kyselyLogSource(runtime.kysely) }`,
  ],
}
```

Contributors are sorted so each runs after every contributor providing one of
its `needs`; a dotted need (`logSources.stage`) is met by a provider of the key
or of its prefix. Emitted lines read services the entry built before them as
`runtime.<name>` — `pikku dev` has logger, variables, secrets, schema and (with
`db`) kysely; the standalone entry has logger, kysely (with a database) and its
scheduler/queue/workflow/trigger services and event hub. Codegen **fails** on a
need nothing meets, on two contributors providing the same key, and on a cycle,
naming the contributors involved.

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
