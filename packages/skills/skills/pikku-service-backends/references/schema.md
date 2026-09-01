# Schema validation (`@pikku/schema-ajv`, `@pikku/schema-cfworker`)

Two implementations of `SchemaService` from `@pikku/core`. Pikku uses whichever
one is wired to validate function inputs and outputs against the schemas codegen
derives from your function definitions.

```bash
yarn add @pikku/schema-ajv       # default for Node.js
yarn add @pikku/schema-cfworker  # Cloudflare Workers
```

Both expose the same four methods:

- `compileSchema(name: string, schema: any): void` — compile and register under `name`
- `validateSchema(schemaName: string, json: any): void` — throws on failure
- `getSchemaNames(): Set<string>`
- `getSchemaKeys(schemaName: string): string[]` — top-level property keys, or `[]` if the schema has no `properties`

On `compileSchema` the first argument is the **name** and the second the schema —
the parameter is called `schema` in the source, which reads backwards.

## `AjvSchemaService`

```typescript
import { AjvSchemaService } from '@pikku/schema-ajv'

const schema = new AjvSchemaService(logger: Logger)
```

Backed by [AJV](https://ajv.js.org/).

- **AJV is a module-level singleton**, shared by every `AjvSchemaService` you
  construct, so compiled schema names are global to the process.
- **`useDefaults: true` mutates the validated object**, filling in schema
  defaults in place.
- `ajv-formats` is registered, so `format` keywords (`email`, `uuid`,
  `date-time`) are enforced.

## `CFWorkerSchemaService`

```typescript
import { CFWorkerSchemaService } from '@pikku/schema-cfworker'

const schema = new CFWorkerSchemaService(logger: Logger)
```

Backed by [@cfworker/json-schema](https://github.com/cfworker/cfworker), which
uses no `eval` or `new Function` and so runs where AJV cannot.

- Each validator gets a **deep clone** of the schema (`@cfworker/json-schema`
  mutates what it is given, which throws on a frozen generated object).
- A compile failure throws `Error('Failed to compile schema: <name>')` with the
  underlying cause swallowed — check the schema by hand when you see it.

## Wiring either one

```typescript
const createSingletonServices = pikkuServices(async (config) => {
  const logger = new ConsoleLogger()
  const schema = new AjvSchemaService(logger)
  return { config, logger, schema }
})
```
