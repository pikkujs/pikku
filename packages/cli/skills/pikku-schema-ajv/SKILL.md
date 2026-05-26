---
name: pikku-schema-ajv
description: 'Use when setting up JSON schema validation with AJV in a Pikku app. Covers AjvSchemaService for request/response validation.
TRIGGER when: code uses AjvSchemaService, user asks about AJV, JSON schema validation, or @pikku/schema-ajv.
DO NOT TRIGGER when: user asks about Cloudflare Workers schema validation (use pikku-schema-cfworker).'
installGroups: [core]
---

# Pikku Schema AJV (JSON Schema Validation)

## Agent Operating Procedure

Use this skill as an execution checklist, not reference material.

1. Discover before editing. Prefer OpenCode tools such as `pikku-meta` when available; otherwise run the relevant `pikku meta ... --json` command and inspect only the focused output you need.
2. Identify the source files that own the behavior. Do not start by reading generated output, `.pikku`, `node_modules`, vendored packages, or broad build artifacts.
3. Make the smallest source change that satisfies the task. Keep generated files generated, and avoid hand-editing SDKs, schema output, or typegen.
4. Validate with the narrowest relevant command first, then run `pikku-verify` or `pikku all` when functions, wirings, schemas, or generated clients may have changed.
5. If validation fails, fix the source cause and rerun validation. Do not paper over generated errors by editing generated files.

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
