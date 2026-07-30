# Addon Package Manifest Reference

`npx pikku new addon` scaffolds these files. You rarely hand-edit them — consult this when wiring exports or config by hand.

## Package Structure

```text
my-addon/
├── package.json               # Exports .pikku/* and dist/
├── pikku.config.json          # addon: true + metadata
├── tsconfig.json              # #pikku path mapping
├── src/
│   ├── services.ts            # createSingletonServices (required)
│   └── functions/
│       └── *.function.ts      # Function definitions
├── types/
│   └── application-types.d.ts # SingletonServices interface
└── .pikku/                    # Generated (gitignored)
```

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

## package.json (key fields)

```json
{
  "name": "@my-org/addon-todos",
  "imports": {
    "#pikku": "./.pikku/pikku-types.gen.ts",
    "#pikku/*": "./.pikku/*"
  },
  "exports": {
    ".": { "types": "./dist/src/index.d.ts", "import": "./dist/src/index.js" },
    "./.pikku/*": "./.pikku/*",
    "./.pikku/pikku-metadata.gen.json": "./.pikku/pikku-metadata.gen.json",
    "./.pikku/rpc/pikku-rpc-wirings-map.internal.gen.js": {
      "types": "./.pikku/rpc/pikku-rpc-wirings-map.internal.gen.d.ts"
    }
  },
  "files": ["dist", ".pikku"],
  "peerDependencies": {
    "@pikku/core": "*"
  },
  "scripts": {
    "pikku": "pikku all",
    "build": "tsc && cp -r .pikku dist/"
  }
}
```
