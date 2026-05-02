---
name: pikku-schema-ajv
description: 'Use when setting up JSON schema validation with AJV in a Pikku app. Covers AjvSchemaService for request/response validation.
TRIGGER when: code uses AjvSchemaService, user asks about AJV, JSON schema validation, or @pikku/schema-ajv.
DO NOT TRIGGER when: user asks about Cloudflare Workers schema validation (use pikku-schema-cfworker).'
---

# Pikku Schema AJV (JSON Schema Validation)

`@pikku/schema-ajv` provides JSON schema validation using [AJV](https://ajv.js.org/). Implements the `SchemaService` interface from `@pikku/core`. This is the default schema validator for Node.js environments.

## Installation

```bash
yarn add @pikku/schema-ajv
```

## API Reference

### `AjvSchemaService`

```typescript
import { AjvSchemaService } from '@pikku/schema-ajv'

const schema = new AjvSchemaService(logger: Logger)
```

**Methods:**
- `compileSchema(schema: string, value: any): void` — Compile and register a JSON schema
- `validateSchema(schemaName: string, json: any): void` — Validate data against a compiled schema (throws on failure)
- `getSchemaNames(): Set<string>` — Get all registered schema names
- `getSchemaKeys(schemaName: string): string[]` — Get property keys for a schema

## Usage Patterns

### With Pikku Services

```typescript
import { AjvSchemaService } from '@pikku/schema-ajv'

const createSingletonServices = pikkuServices(async (config) => {
  const logger = new ConsoleLogger()
  const schema = new AjvSchemaService(logger)
  return { config, logger, schema }
})
```

Pikku automatically uses the schema service to validate function inputs and outputs when schemas are defined in your function definitions.
