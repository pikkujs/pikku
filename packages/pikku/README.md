# pikku

Meta-package that installs `@pikku/core` alongside a sensible default service
set — `@pikku/jose` for JWTs and `@pikku/schema-ajv` for validation, both
re-exported from here.

Use it to get started quickly. Depend on `@pikku/core` and pick services
individually when you want control over what is installed.

Core itself is a dependency, not a re-export: it publishes one entry point per
area, so import from the area you need — `@pikku/core/types`,
`@pikku/core/http`, `@pikku/core/services`.

## Install

```bash
npm install pikku
```

## Usage

```bash
npm create pikku@latest my-app
```

## Docs

https://pikku.dev/docs
