# @pikku/openapi-to-zod-schema

## 0.12.5

### Patch Changes

- 41ce2cb: Upgrade to TypeScript 6 and raise the minimum Node.js version to 22.

  All packages now build against `typescript@^6.0.3` and declare `engines.node >= 22`. Internal tooling (`ts-json-schema-generator`, `zod-to-ts`) was bumped to TypeScript 6-compatible releases.

## 0.12.4

### Patch Changes

- 1419fba: Deprecated: This package has been merged into `@pikku/openapi-parser`. Please use `@pikku/openapi-parser` instead.

## 0.12.3

### Patch Changes

- a0c496f: Fix OpenAPI codegen bugs: use operation description instead of response description, sanitize dots in type names, quote hyphenated property keys, make function input optional in types, and use pikkuServices() in test template.
