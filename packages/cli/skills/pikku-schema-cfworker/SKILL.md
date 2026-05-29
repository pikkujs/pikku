---
name: pikku-schema-cfworker
description: 'Use when setting up JSON schema validation for Cloudflare Workers in a Pikku app. Covers CFWorkerSchemaService as a lightweight alternative to AJV.
TRIGGER when: code uses CFWorkerSchemaService, user asks about schema validation on Cloudflare Workers, or @pikku/schema-cfworker.
DO NOT TRIGGER when: user asks about AJV schema validation (use pikku-schema-ajv).'
installGroups: [core, fabric]
---

# Pikku Schema CFWorker (Cloudflare Workers Validation)

## Agent Operating Procedure

Use this skill as an execution checklist, not reference material.

1. Discover before editing. Prefer OpenCode tools such as `pikku-meta` when available; otherwise run the relevant `pikku meta ... --json` command and inspect only the focused output you need.
2. Identify the source files that own the behavior. Do not start by reading generated output, `.pikku`, `node_modules`, vendored packages, or broad build artifacts.
3. Make the smallest source change that satisfies the task. Keep generated files generated, and avoid hand-editing SDKs, schema output, or typegen.
4. Validate with the narrowest relevant command first, then run `pikku-verify` or `pikku all` when functions, wirings, schemas, or generated clients may have changed.
5. If validation fails, fix the source cause and rerun validation. Do not paper over generated errors by editing generated files.

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
