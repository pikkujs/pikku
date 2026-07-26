# @pikku/schema-cfworker

JSON schema validation for Pikku, backed by
[@cfworker/json-schema](https://github.com/cfworker/cfworker).

Use this on Cloudflare Workers and other runtimes that disallow the runtime code
generation Ajv relies on. On Node, prefer `@pikku/schema-ajv`.

## Install

```bash
npm install @pikku/schema-cfworker
```

## Usage

```typescript
import { CFWorkerSchemaService } from '@pikku/schema-cfworker'

const schema = new CFWorkerSchemaService(logger)
```

## Docs

https://pikku.dev/docs
