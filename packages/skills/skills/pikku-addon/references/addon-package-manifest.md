# Addon Package Manifest Reference

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
`#pikku/function` from matching the *host application's* flat leaf.

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
    }
  },
  "files": ["dist"],
  "peerDependencies": {
    "@pikku/core": "*",
    "zod": "^4"
  },
  "scripts": {
    "prebuild": "pikku all",
    "pikku": "pikku all",
    "build": "tsc && cp -r .pikku types dist/"
  }
}
```

**`imports` names `dist`, never the source tree.** `files: ["dist"]` is the whole
published package, and `build` copies `.pikku` and `types` into it — so a
`#pikku/*` target under `./.pikku/` resolves for the author and for nobody else.
It is a silent break: the addon compiles, packs, installs and then throws
`Cannot find module '.../.pikku/addon/function/index.ts'` on first import in the
consuming app, out of a file the consumer never wrote. The addon's own build
does not read `imports` at all — tsconfig `paths` covers it, which is why the
two maps point at different trees.

**`exports` targets carry the `addon` segment; the subpaths do not.** A consumer
writes `@my-org/addon-todos/.pikku/rpc/...`, exactly as it would in an
application, and the leaf stays the package's own business.

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
