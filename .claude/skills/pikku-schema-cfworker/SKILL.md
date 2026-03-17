---
name: pikku-schema-cfworker
description: 'Use when setting up JSON schema validation for Cloudflare Workers in a Pikku app. Covers CFWorkerSchemaService as a lightweight alternative to AJV.
TRIGGER when: code uses CFWorkerSchemaService, user asks about schema validation on Cloudflare Workers, or @pikku/schema-cfworker.
DO NOT TRIGGER when: user asks about AJV schema validation (use pikku-schema-ajv).'
---

# Pikku Schema CFWorker (Cloudflare Workers Validation)

`@pikku/schema-cfworker` provides JSON schema validation using [@cfworker/json-schema](https://github.com/cfworker/cfworker), a lightweight validator compatible with Cloudflare Workers (no `eval` or `new Function`). Implements the `SchemaService` interface from `@pikku/core`.

## Installation

```bash
yarn add @pikku/schema-cfworker
```

## API Reference

### `CFWorkerSchemaService`

```typescript
import { CFWorkerSchemaService } from '@pikku/schema-cfworker'

const schema = new CFWorkerSchemaService(logger: Logger)
```

**Methods:**
- `compileSchema(schema: string, value: any): void` — Compile and register a JSON schema
- `validateSchema(schemaName: string, json: any): void` — Validate data against a compiled schema (throws on failure)
- `getSchemaNames(): Set<string>` — Get all registered schema names
- `getSchemaKeys(schemaName: string): string[]` — Get property keys for a schema

## Usage Patterns

### With Cloudflare Workers

```typescript
import { CFWorkerSchemaService } from '@pikku/schema-cfworker'

const createSingletonServices = pikkuServices(async (config) => {
  const logger = new ConsoleLogger()
  const schema = new CFWorkerSchemaService(logger)
  return { config, logger, schema }
})
```

Use this instead of `@pikku/schema-ajv` when deploying to Cloudflare Workers, as AJV uses `eval` which is not permitted in the Workers runtime.
