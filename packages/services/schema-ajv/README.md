# @pikku/schema-ajv

JSON schema validation for Pikku, backed by [Ajv](https://ajv.js.org).

The default choice on Node. On Cloudflare Workers use `@pikku/schema-cfworker`,
which avoids Ajv's runtime code generation.

## Install

```bash
npm install @pikku/schema-ajv
```

## Usage

```typescript
import { AjvSchemaService } from '@pikku/schema-ajv'

const schema = new AjvSchemaService(logger)
```

Pikku compiles and caches schemas on first use, so no registration step is
needed.

## Docs

https://pikku.dev/docs
